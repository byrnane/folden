import type { ComputedRef, Ref } from 'vue'
import type { FileFingerprint } from '../../domain/document'
import { createTextFileFormat } from '../../domain/document'
import { shouldPromptToDiscardDocument } from '../../domain/documents/closeProtection'
import type { EditorMode, OpenDocument } from '../../domain/documents/documentState'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import { createDocumentSaveQueue, type SaveJob } from '../../domain/documents/saveQueue'
import type {
  NativeError,
  OpenedDocument,
  WorkspaceEntry,
} from '../../infrastructure/tauri/files'
import {
  closeNativeDocuments,
  openTextFile,
  saveTextFile,
} from '../../infrastructure/tauri/files'
import {
  parentPath,
  suggestFileName,
} from '../helpers/pathHelpers'
import type { EditorPane } from '../types/shell'
import type { ConflictDialogDecision } from './dialogController'

type WorkspaceEntryRef = Pick<WorkspaceEntry, 'path' | 'kind'>
type ReadonlyValue<T> = {
  readonly value: T
}

type DocumentWorkflowDeps = {
  initialText: string
  appSettings: Ref<{
    autosave: {
      enabled: boolean
      debounceMs: number
    }
  }>
  activeDocument: ComputedRef<OpenDocument | null>
  activePane: ComputedRef<EditorPane | undefined>
  activePaneId: Ref<EditorPane['id']>
  visiblePanes: ComputedRef<EditorPane[]>
  paneEditors: Ref<Partial<Record<EditorPane['id'], { flushContent: () => string } | null>>>
  workspace: ReadonlyValue<{ id: string, rootPath: string } | null>
  isFileBusy: Ref<boolean>
  errorMessage: Ref<string | null>
  isDirty: (document: OpenDocument) => boolean
  hasUnsafeUnacknowledgedVisualState: (document: OpenDocument) => boolean
  enforceDocumentVisualSafety: (document: OpenDocument) => void
  clearRemoteImagePermissions: (documentIds: string[]) => void
  setSelectedPath: (path: string | null) => void
  refreshWorkspaceBranch: (branchPath: string | null, preserveDescendants?: boolean) => Promise<void>
  runFileTask: (task: () => Promise<void>, message: string) => Promise<void>
  openUnsavedDialog: (options: {
    title: string
    message: string
    saveLabel: string
    discardLabel: string
    cancelLabel: string
    showSave: boolean
  }) => Promise<'save' | 'discard' | 'cancel'>
  openConflictDialog: (options: {
    title: string
    path: string
    foldenContent: string
    diskContent: string
  }) => Promise<ConflictDialogDecision>
  getPane: (paneId: EditorPane['id']) => EditorPane | null
  getPaneSnapshot: () => EditorPane[]
  setActiveDocument: (pane: EditorPane, documentId: string) => void
  addDocumentToPaneState: (document: OpenDocument, paneId?: EditorPane['id']) => EditorPane | null
  removeDocumentFromPane: (
    paneId: EditorPane['id'],
    documentId: string,
  ) => { removedDocumentIds: string[] }
  removeDocumentsFromPaneState: (documentIds: string[]) => { removedDocumentIds: string[] }
  ensureViewSession: (pane: EditorPane, document: OpenDocument) => { id: string }
  getDocumentMode: (pane: EditorPane, document: OpenDocument) => EditorMode
  applyDocumentUpdateToSessions: (
    update: DocumentUpdate,
    document: OpenDocument,
    applyDocumentUpdate: (
      documentId: string,
      baseRevision: number,
      nextContent: string,
    ) => OpenDocument | null,
  ) => OpenDocument | null
  updateDocumentSessions: (documentId: string, revision: number) => void
  createDocumentDraft: (content: string, fallbackName?: string) => OpenDocument
  openDocumentState: (document: OpenedDocument) => OpenDocument
  getDocument: (documentId: string) => OpenDocument | null
  applyDocumentUpdate: (documentId: string, baseRevision: number, nextContent: string) => OpenDocument | null
  undoDocument: (documentId: string) => OpenDocument | null
  redoDocument: (documentId: string) => OpenDocument | null
  markDocumentQueued: (documentId: string) => OpenDocument | null
  markDocumentSaving: (documentId: string) => OpenDocument | null
  markDocumentSaved: (documentId: string, revision: number, savedDocument: OpenedDocument) => OpenDocument | null
  markDocumentSaveError: (documentId: string, error: NativeError) => OpenDocument | null
  replaceDocumentFromDisk: (documentId: string, document: OpenedDocument) => OpenDocument | null
  markDocumentConflict: (documentId: string, message: string) => OpenDocument | null
  markDocumentMissing: (documentId: string, message: string) => OpenDocument | null
  acknowledgeDocumentConflict: (documentId: string, fingerprint: FileFingerprint | null) => OpenDocument | null
  removeDocuments: (documentIds: string[]) => void
  openWorkspaceFileByPath: (workspaceId: string, path: string) => Promise<OpenedDocument>
  openAbsoluteTextFile: (path: string) => Promise<OpenedDocument>
}

export function createDocumentWorkflowController(deps: DocumentWorkflowDeps) {
  const pendingAutosaves = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
  const saveQueue = createDocumentSaveQueue({
    performSave: (job) => saveTextFile(
      job.documentNativeId,
      job.contentSnapshot,
      job.expectedFingerprint,
      job.fileFormat,
      job.suggestedFileName,
    ),
    onQueued: (job) => {
      deps.markDocumentQueued(job.documentId)
    },
    onSaving: (job) => {
      deps.markDocumentSaving(job.documentId)
    },
    onSaved: (job, savedDocument) => {
      const nextDocument = deps.markDocumentSaved(job.documentId, job.revision, savedDocument)

      if (!nextDocument) {
        return
      }

      if (nextDocument.workspaceId === deps.workspace.value?.id) {
        deps.setSelectedPath(nextDocument.relativePath)
      }

      const didPathChange = job.pathBeforeSave !== savedDocument.path
        || job.relativePathBeforeSave !== savedDocument.relativePath
        || job.workspaceIdBeforeSave !== savedDocument.workspaceId

      if (didPathChange && nextDocument.workspaceId === deps.workspace.value?.id) {
        void deps.refreshWorkspaceBranch(parentPath(nextDocument.relativePath ?? '') ?? '')
      }
    },
    onError: (job, error) => {
      deps.markDocumentSaveError(job.documentId, error)
      syncDocumentExternalStateFromSaveError(job.documentId, error)
    },
  })

  function addDocumentToPane(document: OpenDocument, paneId = deps.activePaneId.value) {
    deps.enforceDocumentVisualSafety(document)
    deps.addDocumentToPaneState(document, paneId)
  }

  function flushPaneEditorContent(paneId: EditorPane['id']) {
    const pane = deps.getPane(paneId)

    if (!pane?.activeDocumentId) {
      return
    }

    const document = deps.getDocument(pane.activeDocumentId)
    const adapter = deps.paneEditors.value[paneId]

    if (!document || !adapter) {
      return
    }

    const nextContent = adapter.flushContent()

    if (nextContent === document.content) {
      return
    }

    const session = deps.ensureViewSession(pane, document)
    handleDocumentUpdate({
      documentId: document.id,
      originViewId: session.id,
      baseRevision: document.revision,
      nextContent,
      updateKind: deps.getDocumentMode(pane, document) === 'visual' ? 'visual-edit' : 'source-edit',
    })
  }

  function flushVisibleDocumentViews(documentId: string) {
    for (const pane of deps.visiblePanes.value) {
      if (pane.activeDocumentId === documentId) {
        flushPaneEditorContent(pane.id)
      }
    }
  }

  function handleDocumentUpdate(update: DocumentUpdate) {
    const document = deps.getDocument(update.documentId)

    if (!document) {
      return
    }

    const nextDocument = deps.applyDocumentUpdateToSessions(update, document, deps.applyDocumentUpdate)

    if (!nextDocument) {
      return
    }

    deps.enforceDocumentVisualSafety(nextDocument)
  }

  function runDocumentUndo() {
    const document = deps.activeDocument.value

    if (!document) {
      return
    }

    flushVisibleDocumentViews(document.id)
    const currentDocument = deps.getDocument(document.id)

    if (!currentDocument) {
      return
    }

    const nextDocument = deps.undoDocument(currentDocument.id)

    if (!nextDocument) {
      return
    }

    deps.updateDocumentSessions(nextDocument.id, nextDocument.revision)
  }

  function runDocumentRedo() {
    const document = deps.activeDocument.value

    if (!document) {
      return
    }

    flushVisibleDocumentViews(document.id)
    const currentDocument = deps.getDocument(document.id)

    if (!currentDocument) {
      return
    }

    const nextDocument = deps.redoDocument(currentDocument.id)

    if (!nextDocument) {
      return
    }

    deps.updateDocumentSessions(nextDocument.id, nextDocument.revision)
  }

  function canSaveActiveDocument() {
    const document = deps.activeDocument.value
    return Boolean(
      document &&
      !deps.isFileBusy.value &&
      (document.externalState === 'idle' || !document.nativeId),
    )
  }

  function canUndoActiveDocument() {
    return (deps.activeDocument.value?.history.past.length ?? 0) > 0
  }

  function canRedoActiveDocument() {
    return (deps.activeDocument.value?.history.future.length ?? 0) > 0
  }

  function openLoadedDocument(document: OpenedDocument, paneId = deps.activePaneId.value) {
    const openDocument = deps.openDocumentState(document)
    deps.enforceDocumentVisualSafety(openDocument)
    addDocumentToPane(openDocument, paneId)
    return openDocument
  }

  function createScratchDocument() {
    const document = deps.createDocumentDraft('# Untitled\n\n', 'Untitled.md')
    addDocumentToPane(document)
  }

  async function openNativeDocument() {
    await deps.runFileTask(async () => {
      const document = await openTextFile()

      if (document) {
        openLoadedDocument(document)
      }
    }, 'Could not open file')
  }

  async function openWorkspaceFile(entry: WorkspaceEntryRef, paneId = deps.activePaneId.value) {
    if (!deps.workspace.value || entry.kind !== 'file') {
      return
    }

    deps.setSelectedPath(entry.path)

    await deps.runFileTask(async () => {
      const document = await deps.openWorkspaceFileByPath(deps.workspace.value!.id, entry.path)
      openLoadedDocument(document, paneId)
    }, 'Could not open workspace file')
  }

  async function saveDocument(document = deps.activeDocument.value, reason: SaveJob['reason'] = 'manual') {
    if (!document) {
      return
    }

    if (reason === 'autosave' && !canAutosaveDocument(document)) {
      return
    }

    if (document.externalState !== 'idle' && document.nativeId) {
      if (reason === 'autosave') {
        return
      }

      deps.errorMessage.value = 'Resolve the external file conflict before saving to the original path.'
      return
    }

    await deps.runFileTask(async () => {
      flushVisibleDocumentViews(document.id)
      const currentDocument = deps.getDocument(document.id)

      if (!currentDocument) {
        return
      }

      await saveQueue.enqueue({
        documentId: currentDocument.id,
        documentNativeId: currentDocument.nativeId,
        pathBeforeSave: currentDocument.path,
        workspaceIdBeforeSave: currentDocument.workspaceId,
        relativePathBeforeSave: currentDocument.relativePath,
        revision: currentDocument.revision,
        contentSnapshot: currentDocument.content,
        expectedFingerprint: currentDocument.diskFingerprint,
        fileFormat: currentDocument.fileFormat ?? createTextFileFormat(),
        suggestedFileName: currentDocument.nativeId ? undefined : suggestFileName(currentDocument.content),
        reason,
      })
    }, 'Could not save file')
  }

  function canAutosaveDocument(document: OpenDocument) {
    return deps.appSettings.value.autosave.enabled &&
      deps.isDirty(document) &&
      document.nativeId !== null &&
      document.externalState === 'idle' &&
      document.saveState !== 'queued' &&
      document.saveState !== 'saving' &&
      document.saveState !== 'error' &&
      !deps.hasUnsafeUnacknowledgedVisualState(document)
  }

  function clearPendingAutosave(documentId: string) {
    const timeoutId = pendingAutosaves.get(documentId)

    if (timeoutId === undefined) {
      return
    }

    globalThis.clearTimeout(timeoutId)
    pendingAutosaves.delete(documentId)
  }

  function scheduleAutosave(document: OpenDocument) {
    clearPendingAutosave(document.id)

    if (!canAutosaveDocument(document)) {
      return
    }

    const timeoutId = globalThis.setTimeout(() => {
      pendingAutosaves.delete(document.id)
      const currentDocument = deps.getDocument(document.id)

      if (!currentDocument || !canAutosaveDocument(currentDocument)) {
        return
      }

      void saveDocument(currentDocument, 'autosave')
    }, deps.appSettings.value.autosave.debounceMs)

    pendingAutosaves.set(document.id, timeoutId)
  }

  function syncDocumentExternalStateFromSaveError(documentId: string, error: NativeError) {
    if (error.code === 'file_changed_externally') {
      deps.markDocumentConflict(documentId, 'The file changed on disk before Folden could save it.')
      return
    }

    if (error.code === 'not_found') {
      deps.markDocumentMissing(documentId, 'The original file is no longer available on disk.')
    }
  }

  function syncAutosaveTimers(documents: OpenDocument[]) {
    const documentIds = new Set(documents.map((document) => document.id))

    for (const documentId of pendingAutosaves.keys()) {
      if (!documentIds.has(documentId)) {
        clearPendingAutosave(documentId)
      }
    }

    for (const document of documents) {
      if (canAutosaveDocument(document)) {
        scheduleAutosave(document)
      } else {
        clearPendingAutosave(document.id)
      }
    }
  }

  async function saveDocumentAsCopy(document = deps.activeDocument.value) {
    if (!document) {
      return
    }

    await deps.runFileTask(async () => {
      flushVisibleDocumentViews(document.id)
      const currentDocument = deps.getDocument(document.id)

      if (!currentDocument) {
        return
      }

      await saveQueue.enqueue({
        documentId: currentDocument.id,
        documentNativeId: null,
        pathBeforeSave: currentDocument.path,
        workspaceIdBeforeSave: currentDocument.workspaceId,
        relativePathBeforeSave: currentDocument.relativePath,
        revision: currentDocument.revision,
        contentSnapshot: currentDocument.content,
        expectedFingerprint: null,
        fileFormat: currentDocument.fileFormat ?? createTextFileFormat(),
        suggestedFileName: suggestFileName(currentDocument.content),
        reason: 'manual',
      })
    }, 'Could not save file copy')
  }

  async function saveDirtyDocuments(documentIds: string[]) {
    for (const documentId of documentIds) {
      const document = deps.getDocument(documentId)

      if (!document || !deps.isDirty(document)) {
        continue
      }

      await saveDocument(document)

      const nextDocument = deps.getDocument(documentId)

      if (nextDocument && deps.isDirty(nextDocument)) {
        return false
      }
    }

    return documentIds.every((documentId) => {
      const document = deps.getDocument(documentId)
      return !document || !deps.isDirty(document)
    })
  }

  function releaseClosedNativeDocuments(documentIds: string[]) {
    const nativeDocumentIds = documentIds
      .map((documentId) => deps.getDocument(documentId)?.nativeId ?? null)
      .filter((documentId): documentId is string => documentId !== null)

    if (!nativeDocumentIds.length) {
      return
    }

    void closeNativeDocuments(nativeDocumentIds).catch(() => {
      // Closing native handles is best-effort; the next open/save will resync watcher state.
    })
  }

  function removeDocumentView(pane: EditorPane, documentId: string) {
    const { removedDocumentIds } = deps.removeDocumentFromPane(pane.id, documentId)

    if (!removedDocumentIds.length) {
      return
    }

    deps.clearRemoteImagePermissions(removedDocumentIds)
    releaseClosedNativeDocuments(removedDocumentIds)
    deps.removeDocuments(removedDocumentIds)
  }

  async function closeDocument(pane: EditorPane, documentId: string) {
    flushPaneEditorContent(pane.id)

    const document = deps.getDocument(documentId)

    if (!document) {
      removeDocumentView(pane, documentId)
      return
    }

    if (!shouldPromptToDiscardDocument(deps.getPaneSnapshot(), documentId, deps.isDirty(document))) {
      removeDocumentView(pane, documentId)
      return
    }

    const decision = await deps.openUnsavedDialog({
      title: `Close ${document.name}?`,
      message: `Save changes to ${document.name} before closing this document?`,
      saveLabel: 'Save',
      discardLabel: 'Discard',
      cancelLabel: 'Cancel',
      showSave: true,
    })

    if (decision === 'cancel') {
      return
    }

    if (decision === 'save') {
      await saveDocument(document)

      const nextDocument = deps.getDocument(documentId)

      if (nextDocument && deps.isDirty(nextDocument)) {
        return
      }
    }

    removeDocumentView(pane, documentId)
  }

  function removeDocumentsFromPanes(documentIds: string[]) {
    const { removedDocumentIds } = deps.removeDocumentsFromPaneState(documentIds)
    deps.clearRemoteImagePermissions(removedDocumentIds)
    releaseClosedNativeDocuments(removedDocumentIds)
    deps.removeDocuments(removedDocumentIds)
  }

  function loadCurrentDiskDocument(document: OpenDocument) {
    if (!document.path) {
      return Promise.resolve(null)
    }

    return (
      deps.workspace.value &&
      document.workspaceId === deps.workspace.value.id &&
      document.relativePath
    )
      ? deps.openWorkspaceFileByPath(deps.workspace.value.id, document.relativePath)
      : deps.openAbsoluteTextFile(document.path)
  }

  function openConflictCopy(document: OpenDocument) {
    const previousActivePane = deps.activePane.value
    const previousActiveDocumentId = previousActivePane?.activeDocumentId ?? null
    const copyDocument = deps.createDocumentDraft(document.content, conflictedCopyName(document.name))
    copyDocument.fileFormat = document.fileFormat
    addDocumentToPane(copyDocument, 'left')

    if (previousActivePane && previousActiveDocumentId) {
      deps.setActiveDocument(previousActivePane, previousActiveDocumentId)
    }

    return copyDocument
  }

  function conflictedCopyName(name: string) {
    const extensionIndex = name.lastIndexOf('.')

    if (extensionIndex <= 0) {
      return `${name} (conflict copy)`
    }

    return `${name.slice(0, extensionIndex)} (conflict copy)${name.slice(extensionIndex)}`
  }

  function resolveConflictWithCurrentContent(documentId: string, fingerprint: FileFingerprint | null) {
    const document = deps.acknowledgeDocumentConflict(documentId, fingerprint)

    if (document) {
      deps.enforceDocumentVisualSafety(document)
      deps.updateDocumentSessions(document.id, document.revision)
    }
  }

  async function openConflictResolution(documentId: string) {
    const document = deps.getDocument(documentId)

    if (!document?.path) {
      return
    }

    flushVisibleDocumentViews(documentId)

    const currentDocument = deps.getDocument(documentId)

    if (!currentDocument?.path) {
      return
    }

    const diskDocument = await loadCurrentDiskDocument(currentDocument)

    if (!diskDocument) {
      return
    }

    const decision = await deps.openConflictDialog({
      title: `Resolve conflict for ${currentDocument.name}`,
      path: currentDocument.path,
      foldenContent: currentDocument.content,
      diskContent: diskDocument.content,
    })

    if (decision.kind === 'later') {
      return
    }

    if (decision.kind === 'save-as') {
      await saveDocumentAsCopy(currentDocument)
      return
    }

    if (decision.kind === 'reload-disk') {
      const latestDocument = deps.getDocument(documentId)

      if (!latestDocument) {
        return
      }

      if (deps.isDirty(latestDocument) && latestDocument.content !== diskDocument.content) {
        openConflictCopy(latestDocument)
      }

      const reloadedDocument = deps.replaceDocumentFromDisk(documentId, diskDocument)

      if (reloadedDocument) {
        deps.enforceDocumentVisualSafety(reloadedDocument)
        deps.updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
      }

      return
    }

    if (decision.kind === 'keep-folden') {
      resolveConflictWithCurrentContent(documentId, diskDocument.fingerprint)
      return
    }

    if (decision.kind !== 'apply-merged') {
      return
    }

    if (decision.content === diskDocument.content) {
      const reloadedDocument = deps.replaceDocumentFromDisk(documentId, diskDocument)

      if (reloadedDocument) {
        deps.enforceDocumentVisualSafety(reloadedDocument)
        deps.updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
      }

      return
    }

    const latestDocument = deps.getDocument(documentId)

    if (!latestDocument) {
      return
    }

    const nextDocument = deps.applyDocumentUpdate(latestDocument.id, latestDocument.revision, decision.content)

    if (nextDocument) {
      nextDocument.diskFingerprint = diskDocument.fingerprint
      nextDocument.saveState = 'idle'
      nextDocument.saveError = null
      nextDocument.externalState = 'idle'
      nextDocument.externalMessage = null
      deps.enforceDocumentVisualSafety(nextDocument)
      deps.updateDocumentSessions(nextDocument.id, nextDocument.revision)
      return
    }

    resolveConflictWithCurrentContent(documentId, diskDocument.fingerprint)
  }

  async function reloadDocumentFromDisk(documentId: string) {
    const document = deps.getDocument(documentId)

    if (!document?.path) {
      return
    }

    const loadedDocument = await loadCurrentDiskDocument(document)

    if (!loadedDocument) {
      return
    }

    const reloadedDocument = deps.replaceDocumentFromDisk(documentId, loadedDocument)

    if (reloadedDocument) {
      deps.enforceDocumentVisualSafety(reloadedDocument)
      deps.updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
    }
  }

  function dispose() {
    for (const timeoutId of pendingAutosaves.values()) {
      globalThis.clearTimeout(timeoutId)
    }

    pendingAutosaves.clear()
  }

  return {
    addDocumentToPane,
    canRedoActiveDocument,
    canSaveActiveDocument,
    canUndoActiveDocument,
    clearPendingAutosave,
    closeDocument,
    createScratchDocument,
    dispose,
    flushPaneEditorContent,
    flushVisibleDocumentViews,
    handleDocumentUpdate,
    loadCurrentDiskDocument,
    openConflictResolution,
    openLoadedDocument,
    openNativeDocument,
    openWorkspaceFile,
    reloadDocumentFromDisk,
    removeDocumentsFromPanes,
    runDocumentRedo,
    runDocumentUndo,
    saveDirtyDocuments,
    saveDocument,
    saveDocumentAsCopy,
    scheduleAutosave,
    syncAutosaveTimers,
  }
}
