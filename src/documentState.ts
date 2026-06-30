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
import {
  createDocumentHistoryState,
  recordDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
  type DocumentHistoryState,
} from './documentHistory'
import type { NativeError } from './tauriFiles'

export type EditorMode = 'visual' | 'source'
export type ExternalDocumentState = 'idle' | 'conflict' | 'missing'

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
  externalState: ExternalDocumentState
  externalMessage: string | null
  history: DocumentHistoryState
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
      externalState: 'idle',
      externalMessage: null,
      history: createDocumentHistoryState(),
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
      existingDocument.externalState = 'idle'
      existingDocument.externalMessage = null
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
      externalState: 'idle',
      externalMessage: null,
      history: createDocumentHistoryState(),
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

  function applyDocumentUpdate(
    documentId: DocumentId,
    baseRevision: DocumentRevision,
    nextContent: string,
  ) {
    const document = getDocument(documentId)

    if (!document || document.revision !== baseRevision) {
      return null
    }

    if (document.content !== nextContent) {
      document.history = recordDocumentHistory(document.history, document.content)
      document.content = nextContent
      document.revision = nextDocumentRevision(document.revision)
      document.externalState = 'idle'
      document.externalMessage = null
    }

    return document
  }

  function undoDocument(documentId: DocumentId) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    const result = undoDocumentHistory(document.history, document.content)

    if (!result) {
      return null
    }

    document.history = result.history
    document.content = result.nextContent
    document.revision = nextDocumentRevision(document.revision)
    return document
  }

  function redoDocument(documentId: DocumentId) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    const result = redoDocumentHistory(document.history, document.content)

    if (!result) {
      return null
    }

    document.history = result.history
    document.content = result.nextContent
    document.revision = nextDocumentRevision(document.revision)
    return document
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
    document.externalState = 'idle'
    document.externalMessage = null

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

  function replaceDocumentFromDisk(documentId: DocumentId, documentSnapshot: LoadedDocument) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    setPathIndex(document.path, null)
    const nextRevision = nextDocumentRevision(document.revision)
    document.nativeId = documentSnapshot.id
    document.path = documentSnapshot.path
    document.workspaceId = documentSnapshot.workspaceId
    document.relativePath = documentSnapshot.relativePath
    document.name = options.fileNameFromPath(documentSnapshot.path)
    document.content = documentSnapshot.content
    document.revision = nextRevision
    document.persistedRevision = nextRevision
    document.fileFormat = documentSnapshot.fileFormat
    document.diskFingerprint = documentSnapshot.fingerprint
    document.saveState = 'idle'
    document.saveError = null
    document.externalState = 'idle'
    document.externalMessage = null
    document.history = createDocumentHistoryState()

    if (!options.isMarkdownPath(documentSnapshot.path)) {
      document.defaultMode = 'source'
    }

    setPathIndex(document.path, document.id)
    return document
  }

  function markDocumentConflict(documentId: DocumentId, message: string) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.externalState = 'conflict'
    document.externalMessage = message
    return document
  }

  function acknowledgeDocumentConflict(documentId: DocumentId, fingerprint: FileFingerprint | null) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.revision = nextDocumentRevision(document.revision)
    document.diskFingerprint = fingerprint
    document.saveState = 'idle'
    document.saveError = null
    document.externalState = 'idle'
    document.externalMessage = null
    return document
  }

  function markDocumentMissing(documentId: DocumentId, message: string) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.externalState = 'missing'
    document.externalMessage = message
    return document
  }

  function clearDocumentExternalState(documentId: DocumentId) {
    const document = getDocument(documentId)

    if (!document) {
      return null
    }

    document.externalState = 'idle'
    document.externalMessage = null
    return document
  }

  function joinWorkspacePath(rootPath: string, relativePath: string) {
    return `${rootPath.replace(/[\\/]+$/u, '')}\\${relativePath.replace(/^[\\/]+/u, '')}`
  }

  function updateDocumentPaths(previousPath: string, nextPath: string, workspaceRootPath?: string) {
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

      setPathIndex(document.path, null)
      document.relativePath = document.relativePath === previousPath
        ? nextPath
        : `${nextPath}${document.relativePath.slice(previousPath.length)}`
      document.name = options.fileNameFromPath(document.relativePath)

      if (workspaceRootPath) {
        document.path = joinWorkspacePath(workspaceRootPath, document.relativePath)
      }

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
    findDocumentByPath,
    updateDocumentContent,
    applyDocumentUpdate,
    undoDocument,
    redoDocument,
    markDocumentQueued,
    markDocumentSaving,
    markDocumentSaved,
    markDocumentSaveError,
    replaceDocumentFromDisk,
    markDocumentConflict,
    acknowledgeDocumentConflict,
    markDocumentMissing,
    clearDocumentExternalState,
    updateDocumentPaths,
    removeDocuments,
  }
}
