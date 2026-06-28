import { computed, ref } from 'vue'
import {
  createTextFileFormat,
  INITIAL_DOCUMENT_REVISION,
  isDocumentDirty,
  nextDocumentRevision,
  type FileFingerprint,
  type DocumentId,
  type DocumentRevision,
  type TextFileFormat,
} from './domain/document'
import type { NativeError } from './tauriFiles'

export type EditorMode = 'visual' | 'source'

export type OpenDocument = {
  id: DocumentId
  nativeId: string | null
  path: string | null
  workspaceId: string | null
  relativePath: string | null
  name: string
  content: string
  revision: DocumentRevision
  persistedRevision: DocumentRevision
  defaultMode: EditorMode
  fileFormat: TextFileFormat
  diskFingerprint: FileFingerprint | null
  saveState: 'idle' | 'queued' | 'saving' | 'error'
  saveError: NativeError | null
}

export type LoadedDocument = {
  id: string
  path: string
  content: string
  workspaceId: string | null
  relativePath: string | null
  fileFormat: TextFileFormat
  fingerprint: FileFingerprint | null
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
      nativeId: null,
      path,
      workspaceId: null,
      relativePath: null,
      name: path ? options.fileNameFromPath(path) : fallbackName ?? 'Untitled.md',
      content,
      revision: INITIAL_DOCUMENT_REVISION,
      persistedRevision: INITIAL_DOCUMENT_REVISION,
      defaultMode: path && !options.isMarkdownPath(path) ? 'source' : 'visual',
      fileFormat: createTextFileFormat(),
      diskFingerprint: null,
      saveState: 'idle',
      saveError: null,
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
      existingDocument.nativeId = document.id
      existingDocument.workspaceId = document.workspaceId
      existingDocument.relativePath = document.relativePath
      existingDocument.fileFormat = document.fileFormat
      existingDocument.diskFingerprint = document.fingerprint
      existingDocument.saveState = 'idle'
      existingDocument.saveError = null
      return existingDocument
    }

    return registerDocument({
      ...createDocument(document.path, document.content),
      nativeId: document.id,
      workspaceId: document.workspaceId,
      relativePath: document.relativePath,
      fileFormat: document.fileFormat,
      diskFingerprint: document.fingerprint,
      saveState: 'idle',
      saveError: null,
    })
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

  function markDocumentQueued(documentId: DocumentId) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.saveState = 'queued'
    document.saveError = null
    return document
  }

  function markDocumentSaving(documentId: DocumentId) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.saveState = 'saving'
    document.saveError = null
    return document
  }

  function markDocumentSaved(
    documentId: DocumentId,
    savedRevision: DocumentRevision,
    documentSnapshot: LoadedDocument,
  ) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    setPathIndex(document.path, null)
    document.nativeId = documentSnapshot.id
    document.path = documentSnapshot.path
    document.workspaceId = documentSnapshot.workspaceId
    document.relativePath = documentSnapshot.relativePath
    document.name = options.fileNameFromPath(documentSnapshot.path)
    document.fileFormat = documentSnapshot.fileFormat
    document.diskFingerprint = documentSnapshot.fingerprint
    document.persistedRevision = savedRevision
    document.saveState = 'idle'
    document.saveError = null

    if (!options.isMarkdownPath(documentSnapshot.path)) {
      document.defaultMode = 'source'
    }

    setPathIndex(document.path, document.id)
    return document
  }

  function markDocumentSaveError(documentId: DocumentId, error: NativeError) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.saveState = 'error'
    document.saveError = error
    return document
  }

  function updateDocumentPaths(previousPath: string, nextPath: string) {
    const normalizedPreviousPath = options.normalizePath(previousPath)

    for (const document of documents.value) {
      if (!document.relativePath) {
        continue
      }

      const normalizedDocumentPath = options.normalizePath(document.relativePath)

      if (
        normalizedDocumentPath !== normalizedPreviousPath &&
        !normalizedDocumentPath.startsWith(`${normalizedPreviousPath}\\`)
      ) {
        continue
      }

      document.relativePath = document.relativePath === previousPath
        ? nextPath
        : `${nextPath}${document.relativePath.slice(previousPath.length)}`
      document.name = options.fileNameFromPath(document.relativePath)
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
    markDocumentQueued,
    markDocumentSaving,
    markDocumentSaved,
    markDocumentSaveError,
    updateDocumentPaths,
    removeDocuments,
  }
}
