import { ref } from 'vue'
import type { OpenDocument } from '../../domain/documents/documentState'
import {
  analyzeMarkdownSafety,
  type MarkdownSafetyReport,
} from '../../domain/markdown/markdownSafety'
import { isMarkdownDocument } from '../helpers/pathHelpers'

type VisualSafetyDeps = {
  setOpenDocumentMode: (documentId: string, mode: OpenDocument['defaultMode']) => void
  openMarkdownSafetyDialog: (options: {
    title: string
    features: MarkdownSafetyReport['unsupportedFeatures']
  }) => Promise<boolean>
}

export function createVisualSafetyController(deps: VisualSafetyDeps) {
  void deps
  const markdownSafetyCache = ref<Record<string, MarkdownSafetyReport>>({})
  const remoteImagePermissions = ref<Record<string, boolean>>({})

  function markdownSafetyCacheKey(document: Pick<OpenDocument, 'id' | 'revision'>) {
    return `${document.id}:${document.revision}`
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

  function hasUnsafeUnacknowledgedVisualState(document: OpenDocument) {
    void document
    return false
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

  function enforceDocumentVisualSafety(document: OpenDocument) {
    void document
  }

  async function confirmVisualMode(document: OpenDocument) {
    return isMarkdownDocument(document)
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
