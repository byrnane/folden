import { computed, ref } from 'vue'
import {
  INITIAL_DOCUMENT_REVISION,
  isDocumentDirty,
  nextDocumentRevision,
  type DocumentId,
  type DocumentRevision,
} from './domain/document'

export type EditorMode = 'visual' | 'source'

export type OpenDocument = {
  id: DocumentId
  path: string | null
  name: string
  content: string
  revision: DocumentRevision
  persistedRevision: DocumentRevision
  defaultMode: EditorMode
}

export type LoadedDocument = {
  path: string
  content: string
}

type DocumentStateOptions = {
  fileNameFromPath: (path: string) => string
  isMarkdownPath: (path: string | null) => boolean
  normalizePath: (path: string) => string
}

export function createDocumentState(options: DocumentStateOptions) {
  const documentsById = ref<Record<DocumentId, OpenDocument>>({})
  const documentOrder = ref<DocumentId[]>([])
  const pathToDocumentId = ref<Record<string, DocumentId>>({})

  const documents = computed(() =>
    documentOrder.value
      .map((documentId) => documentsById.value[documentId] ?? null)
      .filter((document): document is OpenDocument => document !== null),
  )
  const dirtyDocuments = computed(() => documents.value.filter((document) => isDocumentDirty(document)))

  function setPathIndex(path: string | null, documentId: DocumentId | null) {
    if (!path) {
      return
    }

    const normalizedPath = options.normalizePath(path)

    if (documentId) {
      pathToDocumentId.value[normalizedPath] = documentId
      return
    }

    delete pathToDocumentId.value[normalizedPath]
  }

  function registerDocument(document: OpenDocument) {
    documentsById.value[document.id] = document
    documentOrder.value = [...documentOrder.value, document.id]
    setPathIndex(document.path, document.id)
    return document
  }

  function createDocument(path: string | null, content: string, fallbackName?: string): OpenDocument {
    return {
      id: crypto.randomUUID(),
      path,
      name: path ? options.fileNameFromPath(path) : fallbackName ?? 'Untitled.md',
      content,
      revision: INITIAL_DOCUMENT_REVISION,
      persistedRevision: INITIAL_DOCUMENT_REVISION,
      defaultMode: path && !options.isMarkdownPath(path) ? 'source' : 'visual',
    }
  }

  function getDocument(documentId: DocumentId) {
    return documentsById.value[documentId] ?? null
  }

  function findDocumentByPath(path: string) {
    const documentId = pathToDocumentId.value[options.normalizePath(path)]
    return documentId ? getDocument(documentId) : null
  }

  function createScratchDocument(content: string, fallbackName?: string) {
    return registerDocument(createDocument(null, content, fallbackName))
  }

  function openLoadedDocument(document: LoadedDocument) {
    const existingDocument = findDocumentByPath(document.path)

    if (existingDocument) {
      return existingDocument
    }

    return registerDocument(createDocument(document.path, document.content))
  }

  function updateDocumentContent(documentId: DocumentId | null, nextContent: string) {
    if (!documentId) {
      return
    }

    const document = getDocument(documentId)

    if (!document || document.content === nextContent) {
      return
    }

    document.content = nextContent
    document.revision = nextDocumentRevision(document.revision)
  }

  function markDocumentSaved(documentId: DocumentId, savedPath: string) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    setPathIndex(document.path, null)
    document.path = savedPath
    document.name = options.fileNameFromPath(savedPath)
    document.persistedRevision = document.revision

    if (!options.isMarkdownPath(savedPath)) {
      document.defaultMode = 'source'
    }

    setPathIndex(document.path, document.id)
    return document
  }

  function updateDocumentPaths(previousPath: string, nextPath: string) {
    const normalizedPreviousPath = options.normalizePath(previousPath)

    for (const document of documents.value) {
      if (!document.path) {
        continue
      }

      const normalizedDocumentPath = options.normalizePath(document.path)

      if (
        normalizedDocumentPath !== normalizedPreviousPath &&
        !normalizedDocumentPath.startsWith(`${normalizedPreviousPath}\\`)
      ) {
        continue
      }

      setPathIndex(document.path, null)
      document.path = document.path === previousPath
        ? nextPath
        : `${nextPath}${document.path.slice(previousPath.length)}`
      document.name = options.fileNameFromPath(document.path)
      setPathIndex(document.path, document.id)
    }
  }

  function removeDocuments(documentIds: DocumentId[]) {
    if (!documentIds.length) {
      return
    }

    const documentIdSet = new Set(documentIds)

    for (const documentId of documentIds) {
      const document = getDocument(documentId)

      if (!document) {
        continue
      }

      setPathIndex(document.path, null)
      delete documentsById.value[documentId]
    }

    documentOrder.value = documentOrder.value.filter((documentId) => !documentIdSet.has(documentId))
  }

  return {
    documents,
    dirtyDocuments,
    getDocument,
    createScratchDocument,
    openLoadedDocument,
    updateDocumentContent,
    markDocumentSaved,
    updateDocumentPaths,
    removeDocuments,
  }
}
