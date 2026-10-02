import { ref } from 'vue'
import type { OpenDocument } from '../../domain/documents/documentState'
import {
  hasRemoteMarkdownImages,
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
  const remoteImagePermissions = ref<Record<string, boolean>>({})

  function hasUnsafeUnacknowledgedVisualState(document: OpenDocument) {
    void document
    return false
  }

  function documentHasRemoteImages(document: OpenDocument) {
    return isMarkdownDocument(document) && hasRemoteMarkdownImages(document.content)
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
