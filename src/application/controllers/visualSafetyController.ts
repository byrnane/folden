import { ref } from 'vue'
import type { OpenDocument } from '../../domain/documents/documentState'
import {
  analyzeMarkdownSafety,
  type MarkdownSafetyReport,
} from '../../domain/markdown/markdownSafety'
import { isMarkdownPath } from '../helpers/pathHelpers'

type VisualSafetyDeps = {
  setOpenDocumentMode: (documentId: string, mode: OpenDocument['defaultMode']) => void
  openMarkdownSafetyDialog: (options: {
    title: string
    features: MarkdownSafetyReport['unsupportedFeatures']
  }) => Promise<boolean>
}

export function createVisualSafetyController(deps: VisualSafetyDeps) {
  const markdownSafetyCache = ref<Record<string, MarkdownSafetyReport>>({})
  const visualSafetyAcknowledgments = ref<Record<string, number>>({})
  const remoteImagePermissions = ref<Record<string, boolean>>({})

  function markdownSafetyCacheKey(document: Pick<OpenDocument, 'id' | 'revision'>) {
    return `${document.id}:${document.revision}`
  }

  function isMarkdownDocument(document: Pick<OpenDocument, 'path'>) {
    return isMarkdownPath(document.path)
  }

  function getMarkdownSafetyReport(document: OpenDocument) {
    if (!isMarkdownDocument(document)) {
      return {
        safeForVisualEditing: true,
        unsupportedFeatures: [],
        remoteImages: [],
      } satisfies MarkdownSafetyReport
    }

    const cacheKey = markdownSafetyCacheKey(document)
    const cachedReport = markdownSafetyCache.value[cacheKey]

    if (cachedReport) {
      return cachedReport
    }

    const nextReport = analyzeMarkdownSafety(document.content)
    markdownSafetyCache.value = {
      ...markdownSafetyCache.value,
      [cacheKey]: nextReport,
    }
    return nextReport
  }

  function acknowledgeVisualSafety(document: OpenDocument) {
    visualSafetyAcknowledgments.value = {
      ...visualSafetyAcknowledgments.value,
      [document.id]: document.revision,
    }
  }

  function isVisualSafetyAcknowledged(document: OpenDocument) {
    return visualSafetyAcknowledgments.value[document.id] === document.revision
  }

  function hasUnsafeUnacknowledgedVisualState(document: OpenDocument) {
    if (!isMarkdownDocument(document)) {
      return false
    }

    const safetyReport = getMarkdownSafetyReport(document)
    return !safetyReport.safeForVisualEditing && !isVisualSafetyAcknowledged(document)
  }

  function documentHasRemoteImages(document: OpenDocument) {
    return getMarkdownSafetyReport(document).remoteImages.length > 0
  }

  function shouldLoadRemoteImages(document: OpenDocument) {
    return remoteImagePermissions.value[document.id] === true
  }

  function allowRemoteImagesForDocument(document: OpenDocument) {
    remoteImagePermissions.value = {
      ...remoteImagePermissions.value,
      [document.id]: true,
    }
  }

  function clearRemoteImagePermissions(documentIds: string[]) {
    if (!documentIds.some((documentId) => documentId in remoteImagePermissions.value)) {
      return
    }

    const nextPermissions = { ...remoteImagePermissions.value }

    for (const documentId of documentIds) {
      delete nextPermissions[documentId]
    }

    remoteImagePermissions.value = nextPermissions
  }

  function resetVisualSafetyAcknowledgment(documentId: string, revision: number) {
    if (visualSafetyAcknowledgments.value[documentId] === revision) {
      return
    }

    if (!(documentId in visualSafetyAcknowledgments.value)) {
      return
    }

    const nextAcknowledgments = { ...visualSafetyAcknowledgments.value }
    delete nextAcknowledgments[documentId]
    visualSafetyAcknowledgments.value = nextAcknowledgments
  }

  function enforceDocumentVisualSafety(document: OpenDocument) {
    resetVisualSafetyAcknowledgment(document.id, document.revision)

    if (!isMarkdownDocument(document)) {
      return
    }

    const safetyReport = getMarkdownSafetyReport(document)

    if (safetyReport.safeForVisualEditing || isVisualSafetyAcknowledged(document)) {
      return
    }

    document.defaultMode = 'source'
    deps.setOpenDocumentMode(document.id, 'source')
  }

  async function confirmVisualMode(document: OpenDocument) {
    if (!isMarkdownDocument(document)) {
      return false
    }

    const safetyReport = getMarkdownSafetyReport(document)

    if (safetyReport.safeForVisualEditing || isVisualSafetyAcknowledged(document)) {
      return true
    }

    const confirmed = await deps.openMarkdownSafetyDialog({
      title: `Visual mode may rewrite ${document.name}`,
      features: safetyReport.unsupportedFeatures,
    })

    if (confirmed) {
      acknowledgeVisualSafety(document)
    }

    return confirmed
  }

  return {
    allowRemoteImagesForDocument,
    clearRemoteImagePermissions,
    confirmVisualMode,
    documentHasRemoteImages,
    enforceDocumentVisualSafety,
    hasUnsafeUnacknowledgedVisualState,
    shouldLoadRemoteImages,
  }
}
