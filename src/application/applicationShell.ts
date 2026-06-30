import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AppCommand } from './commands'
import type { FileFingerprint } from '../domain/document'
import {
  analyzeMarkdownSafety,
  type MarkdownSafetyReport,
} from '../domain/markdown/markdownSafety'
import {
  createDialogController,
  type ConflictDialogDecision,
  type RecoveryDialogDecision,
  type UnsavedDialogDecision,
} from './controllers/dialogController'
import { createCommandController } from './controllers/commandController'
import { createPaneController } from './controllers/paneController'
import { shouldPromptToDiscardDocument } from '../domain/documents/closeProtection'
import {
  closeNativeDocuments,
  createDirectory,
  createFile,
  exportDiagnostics,
  listDirectory,
  logFrontendEvent,
  type NativeFsEvent,
  openLogsFolder,
  openTextFile,
  openTextFileByPath,
  openWorkspaceDirectory,
  renamePath,
  restoreWorkspaceByPath,
  saveTextFile,
  trashPath,
  type NativeError,
  type OpenedDocument,
  type WorkspaceDescriptor,
  type WorkspaceEntry,
} from '../infrastructure/tauri/files'
import {
  type EditorMode,
  type OpenDocument,
} from '../domain/documents/documentState'
import { createTextFileFormat } from '../domain/document'
import {
  type DocumentUpdate,
} from '../domain/documents/editorSync'
import { createDocumentSaveQueue } from '../domain/documents/saveQueue'
import {
  loadApplicationSettings,
  saveApplicationSettings,
} from '../infrastructure/settings/settings'
import {
  cleanDisplayPath,
  isMarkdownPath,
  joinWorkspacePath,
  normalizePath,
  parentPath,
  recoveredCopyName,
  suggestFileName,
  workspaceNameFromPath,
} from './helpers/pathHelpers'
import { createWorkspaceController } from './controllers/workspaceController'
import { createDocumentController } from './controllers/documentController'
import { createExternalChangesController } from './controllers/externalChangesController'
import { createSessionController } from './controllers/sessionController'
import {
  buildSessionDocumentKey,
  loadRecoverySnapshots,
  loadSessionState,
  openTextFileAtPath,
  saveRecoverySnapshots,
  saveSessionState,
  type PersistedSessionState,
  type RecoverySnapshot,
} from './sessionRecovery'
import type { EditorAdapter, EditorPane, WindowCloseDecision } from './types/shell'
export type { EditorAdapter } from './types/shell'

type WorkspaceEntryRef = Pick<WorkspaceEntry, 'name' | 'path' | 'kind'> & {
  readonly children?: unknown
}

export function useApplicationShell() {
  const initialText = '# Untitled\n\nStart writing in Folden.\n'
  const hasNativeRuntimeOnStartup = isTauriRuntime()
  const appSettings = ref(loadApplicationSettings())
  const documentController = createDocumentController(initialText)
  const {
    initialDocument,
    isDirty,
    documents,
    dirtyDocuments,
    getDocument,
    findDocumentByPath,
    createScratchDocument: createDocumentDraft,
    openLoadedDocument: openDocumentState,
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
  } = documentController

  const workspaceController = createWorkspaceController(appSettings)
  const {
    workspace,
    expandedWorkspacePaths,
    loadedWorkspacePaths,
    loadingWorkspacePaths,
    workspaceLoadErrors,
    selectedPath,
    recentWorkspaces,
    setWorkspacePathLoading,
    setWorkspacePathExpanded,
    clearWorkspaceLoadError,
    setWorkspaceLoadError,
    removeWorkspacePathState,
    remapWorkspacePathState,
    clearSidebarSelection,
    setSelectedPath,
    setWatcherVisibleWorkspace,
    findEntry,
    selectedDirectoryPath: getSelectedDirectoryPath,
    applyWorkspaceBranch,
    loadedDescendantPaths,
    shouldLoadBranch,
    nearestLoadedWorkspaceBranch: getNearestLoadedWorkspaceBranch,
    workspaceRelativePathFromAbsolute: getWorkspaceRelativePathFromAbsolute,
  } = workspaceController
  const paneController = createPaneController(initialDocument)
  const {
    panes,
    activePaneId,
    splitEnabled,
    paneDocumentModes,
    viewSessions,
    paneEditors,
    visiblePanes,
    activePane,
    getPane,
    setActivePane,
    paneDocumentModeKey,
    getDocumentMode,
    ensureViewSession,
    getViewSessionId,
    setActiveDocument,
    setActiveDocumentInPane,
    setPaneEditorAdapter,
    setDocumentMode,
    setOpenDocumentMode,
    addDocumentToPane: addDocumentToPaneState,
    applyDocumentUpdateToSessions,
    updateDocumentSessions,
    setSplitEnabled,
    moveDocumentToPane,
    normalizePaneState,
    removeDocumentFromPane,
    removeDocumentsFromPanes: removeDocumentsFromPaneState,
    clearLayout,
    setFallbackDocument,
    restoreLayout,
    getPaneSnapshot,
  } = paneController
  const errorMessage = ref<string | null>(null)
  const externalChangesController = createExternalChangesController()
  const {
    watcherWarning,
    setWatcherWarning,
    setFsEventUnlisten,
    setWatcherWarningUnlisten,
    scheduleWorkspaceRefresh: scheduleWorkspaceRefreshDebounced,
    scheduleDocumentReload: scheduleDocumentReloadDebounced,
    handleExternalFileEvent: routeExternalFileEvent,
    dispose: disposeExternalChangesController,
  } = externalChangesController
  const isFileBusy = ref(false)
  const dialogController = createDialogController()
  const {
    promptDialog,
    promptDialogError,
    confirmDialog,
    unsavedDialog,
    markdownSafetyDialog,
    conflictDialog,
    recoveryDialog,
    openPromptDialog,
    submitPromptDialog,
    cancelPromptDialog,
    openConfirmDialog,
    resolveConfirmDialog,
    openMarkdownSafetyDialog,
    resolveMarkdownSafetyDialog,
    openUnsavedDialog,
    resolveUnsavedDialog,
    openRecoveryDialog,
    resolveRecoveryDialog,
    openConflictDialog,
    resolveConflictDialog,
  } = dialogController
  const sessionController = createSessionController(hasNativeRuntimeOnStartup)
  const {
    pendingRecoveryEntries,
    markRestoreComplete,
    setPendingRecoveryEntries,
    removePendingRecoveryEntry,
    discardPendingRecoveryEntries,
    buildPersistedSessionState: buildSessionStateSnapshot,
    buildPersistedRecoverySnapshots: buildRecoverySnapshotState,
    persistSessionAndRecoveryState: runSessionPersistence,
    scheduleSessionPersistence: scheduleSessionPersistenceDebounced,
    dispose: disposeSessionController,
  } = sessionController
  let tauriWindowCloseUnlisten: (() => void) | null = null
  const markdownSafetyCache = ref<Record<string, MarkdownSafetyReport>>({})
  const visualSafetyAcknowledgments = ref<Record<string, number>>({})
  const remoteImagePermissions = ref<Record<string, boolean>>({})
  const pendingAutosaves = new Map<string, number>()
  const saveQueue = createDocumentSaveQueue({
    performSave: (job) => saveTextFile(
      job.documentNativeId,
      job.contentSnapshot,
      job.expectedFingerprint,
      job.fileFormat,
      job.suggestedFileName,
    ),
    onQueued: (job) => {
      markDocumentQueued(job.documentId)
    },
    onSaving: (job) => {
      markDocumentSaving(job.documentId)
    },
    onSaved: (job, savedDocument) => {
      const nextDocument = markDocumentSaved(job.documentId, job.revision, savedDocument)

      if (!nextDocument) {
        return
      }

      if (nextDocument.workspaceId === workspace.value?.id) {
        setSelectedPath(nextDocument.relativePath)
      }

      const didPathChange = job.pathBeforeSave !== savedDocument.path
        || job.relativePathBeforeSave !== savedDocument.relativePath
        || job.workspaceIdBeforeSave !== savedDocument.workspaceId

      if (didPathChange && nextDocument.workspaceId === workspace.value?.id) {
        void refreshWorkspaceBranch(parentPath(nextDocument.relativePath ?? '') ?? '')
      }
    },
    onError: (job, error) => {
      markDocumentSaveError(job.documentId, error)
      syncDocumentExternalStateFromSaveError(job.documentId, error)
    },
  })
  const activeDocument = computed(() => {
    if (!activePane.value?.activeDocumentId) {
      return null
    }

    return getDocument(activePane.value.activeDocumentId)
  })
  const activePath = computed(() => {
    if (!workspace.value || activeDocument.value?.workspaceId !== workspace.value.id) {
      return null
    }

    return activeDocument.value.relativePath
  })
  const activeLocation = computed(() => {
    if (!activeDocument.value?.path) {
      return 'Scratch'
    }

    return cleanDisplayPath(activeDocument.value.path)
  })
  const selectedDirectoryPath = computed(() => {
    return getSelectedDirectoryPath(parentPath)
  })

  function buildPersistedSessionState() {
    return buildSessionStateSnapshot({
      documents: documents.value,
      workspace: workspace.value,
      splitEnabled: splitEnabled.value,
      activePaneId: activePaneId.value,
      panes: getPaneSnapshot(),
      paneDocumentModes: paneDocumentModes.value,
      normalizePath,
      getDocument,
    })
  }

  function buildPersistedRecoverySnapshots(excludedKeys = new Set<string>()) {
    return buildRecoverySnapshotState({
      documents: documents.value,
      workspace: workspace.value,
      isDirty,
      normalizePath,
      excludedKeys,
    })
  }

  async function writeSessionAndRecoveryState() {
    try {
      await saveSessionState(buildPersistedSessionState())
      await saveRecoverySnapshots(buildPersistedRecoverySnapshots())
    } catch (error) {
      errorMessage.value = `Could not persist session data: ${formatError(error)}`
    }
  }

  async function persistSessionAndRecoveryState() {
    await runSessionPersistence(writeSessionAndRecoveryState)
  }

  function scheduleSessionPersistence() {
    scheduleSessionPersistenceDebounced(writeSessionAndRecoveryState)
  }

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
    setOpenDocumentMode(document.id, 'source')
  }

  function formatError(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'userMessage' in error &&
      typeof (error as { userMessage?: unknown }).userMessage === 'string'
    ) {
      return (error as { userMessage: string }).userMessage
    }

    return error instanceof Error ? error.message : String(error)
  }

  function validateEntryName(value: string) {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return 'Name is required.'
    }

    if (trimmedValue === '.' || trimmedValue === '..') {
      return 'Name is not allowed.'
    }

    if (/[\\/]/.test(trimmedValue)) {
      return 'Name cannot contain path separators.'
    }

    return null
  }

  function normalizePromptValue(value: string) {
    return value.trim()
  }

  async function confirmVisualMode(document: OpenDocument) {
    if (!isMarkdownDocument(document)) {
      return false
    }

    const safetyReport = getMarkdownSafetyReport(document)

    if (safetyReport.safeForVisualEditing || isVisualSafetyAcknowledged(document)) {
      return true
    }

    const confirmed = await openMarkdownSafetyDialog({
      title: `Visual mode may rewrite ${document.name}`,
      features: safetyReport.unsupportedFeatures,
    })

    if (confirmed) {
      acknowledgeVisualSafety(document)
    }

    return confirmed
  }

  async function setPaneDocumentMode(pane: EditorPane, document: OpenDocument, mode: EditorMode) {
    if (mode === 'visual' && !isMarkdownPath(document.path)) {
      return
    }

    if (mode === 'visual' && !(await confirmVisualMode(document))) {
      return
    }

    flushPaneEditorContent(pane.id)
    setDocumentMode(pane.id, document, mode)
  }

  function addDocumentToPane(document: OpenDocument, paneId = activePaneId.value) {
    enforceDocumentVisualSafety(document)
    addDocumentToPaneState(document, paneId)
  }

  function flushPaneEditorContent(paneId: EditorPane['id']) {
    const pane = getPane(paneId)

    if (!pane?.activeDocumentId) {
      return
    }

    const document = getDocument(pane.activeDocumentId)
    const adapter = paneEditors.value[paneId]

    if (!document || !adapter) {
      return
    }

    const nextContent = adapter.flushContent()

    if (nextContent === document.content) {
      return
    }

    const session = ensureViewSession(pane, document)
    handleDocumentUpdate({
      documentId: document.id,
      originViewId: session.id,
      baseRevision: document.revision,
      nextContent,
      updateKind: getDocumentMode(pane, document) === 'visual' ? 'visual-edit' : 'source-edit',
    })
  }

  function flushVisibleDocumentViews(documentId: string) {
    for (const pane of visiblePanes.value) {
      if (pane.activeDocumentId === documentId) {
        flushPaneEditorContent(pane.id)
      }
    }
  }

  function handleDocumentUpdate(update: DocumentUpdate) {
    const document = getDocument(update.documentId)

    if (!document) {
      return
    }

    const nextDocument = applyDocumentUpdateToSessions(update, document, applyDocumentUpdate)

    if (!nextDocument) {
      return
    }

    enforceDocumentVisualSafety(nextDocument)
  }

  function runDocumentUndo() {
    const document = activeDocument.value

    if (!document) {
      return
    }

    flushVisibleDocumentViews(document.id)
    const currentDocument = getDocument(document.id)

    if (!currentDocument) {
      return
    }

    const nextDocument = undoDocument(currentDocument.id)

    if (!nextDocument) {
      return
    }

    updateDocumentSessions(nextDocument.id, nextDocument.revision)
  }

  function runDocumentRedo() {
    const document = activeDocument.value

    if (!document) {
      return
    }

    flushVisibleDocumentViews(document.id)
    const currentDocument = getDocument(document.id)

    if (!currentDocument) {
      return
    }

    const nextDocument = redoDocument(currentDocument.id)

    if (!nextDocument) {
      return
    }

    updateDocumentSessions(nextDocument.id, nextDocument.revision)
  }

  function canSaveActiveDocument() {
    const document = activeDocument.value
    return Boolean(
      document &&
      !isFileBusy.value &&
      (document.externalState === 'idle' || !document.nativeId),
    )
  }

  function canUndoActiveDocument() {
    return (activeDocument.value?.history.past.length ?? 0) > 0
  }

  function canRedoActiveDocument() {
    return (activeDocument.value?.history.future.length ?? 0) > 0
  }

  function openLoadedDocument(document: OpenedDocument, paneId = activePaneId.value) {
    const openDocument = openDocumentState(document)
    enforceDocumentVisualSafety(openDocument)
    addDocumentToPane(openDocument, paneId)
    return openDocument
  }

  function createScratchDocument() {
    const document = createDocumentDraft('# Untitled\n\n', 'Untitled.md')
    addDocumentToPane(document)
  }

  async function openNativeDocument() {
    await runFileTask(async () => {
      const document = await openTextFile()

      if (document) {
        openLoadedDocument(document)
      }
    }, 'Could not open file')
  }

  async function openWorkspace() {
    await runFileTask(async () => {
      const descriptor = await openWorkspaceDirectory()

      if (!descriptor) {
        return
      }

      if (!(await prepareWorkspaceSwitch(descriptor.rootPath))) {
        return
      }

      await loadWorkspace(descriptor)
    }, 'Could not open workspace')
  }

  async function loadWorkspace(descriptor: WorkspaceDescriptor) {
    setWatcherVisibleWorkspace(descriptor, await listDirectory(descriptor.id, ''))
  }

  function getWorkspaceDocumentIds(workspaceId: string) {
    return documents.value
      .filter((document) => document.workspaceId === workspaceId)
      .map((document) => document.id)
  }

  async function prepareWorkspaceSwitch(nextRootPath: string) {
    const currentWorkspace = workspace.value

    if (!currentWorkspace || normalizePath(currentWorkspace.rootPath) === normalizePath(nextRootPath)) {
      return true
    }

    const affectedDocumentIds = getWorkspaceDocumentIds(currentWorkspace.id)
    const dirtyWorkspaceDocuments = affectedDocumentIds
      .map((documentId) => getDocument(documentId))
      .filter((document): document is OpenDocument => document !== null && isDirty(document))

    if (dirtyWorkspaceDocuments.length) {
      const decision = await openUnsavedDialog({
        title: 'Switch workspace?',
        message: `Save changes to ${dirtyWorkspaceDocuments.length} unsaved ${dirtyWorkspaceDocuments.length === 1 ? 'document' : 'documents'} before switching workspace?`,
        saveLabel: 'Save and switch',
        discardLabel: 'Switch without saving',
        cancelLabel: 'Cancel',
        showSave: true,
      })

      if (decision === 'cancel') {
        return false
      }

      if (decision === 'save') {
        const saved = await saveDirtyDocuments(dirtyWorkspaceDocuments.map((document) => document.id))

        if (!saved) {
          return false
        }
      }
    }

    removeDocumentsFromPanes(affectedDocumentIds)
    normalizePaneState()
    return true
  }

  async function refreshWorkspace() {
    await refreshWorkspaceBranch('')
  }

  async function refreshWorkspaceBranch(branchPath: string | null, preserveDescendants = true) {
    if (!workspace.value) {
      return
    }

    const normalizedBranchPath = branchPath ?? ''
    clearWorkspaceLoadError(normalizedBranchPath)
    applyWorkspaceBranch(
      normalizedBranchPath,
      await listDirectory(workspace.value.id, normalizedBranchPath),
    )

    if (!preserveDescendants) {
      return
    }

    const descendantPaths = loadedDescendantPaths(normalizedBranchPath, isSameOrChildPath)

    for (const descendantPath of descendantPaths) {
      await refreshWorkspaceBranch(descendantPath, false)
    }
  }

  async function ensureWorkspaceBranchLoaded(branchPath: string) {
    if (!shouldLoadBranch(branchPath)) {
      return
    }

    setWorkspacePathLoading(branchPath, true)

    try {
      await refreshWorkspaceBranch(branchPath)
    } catch (error) {
      setWorkspaceLoadError(branchPath, formatError(error))
      throw error
    } finally {
      setWorkspacePathLoading(branchPath, false)
    }
  }

  async function toggleWorkspaceDirectory(entry: WorkspaceEntryRef) {
    if (expandedWorkspacePaths.value.has(entry.path)) {
      setWorkspacePathExpanded(entry.path, false)
      return
    }

    setWorkspacePathExpanded(entry.path, true)

    try {
      await ensureWorkspaceBranchLoaded(entry.path)
    } catch (error) {
      setWatcherWarning(`Could not load folder ${entry.name}: ${formatError(error)}`)
    }
  }

  function scheduleWorkspaceRefresh(branchPath: string | null) {
    const key = getNearestLoadedWorkspaceBranch(branchPath, parentPath)
    scheduleWorkspaceRefreshDebounced(key, () => {
      void refreshWorkspaceBranch(key).catch((error) => {
        setWatcherWarning(`Could not refresh workspace after external changes: ${formatError(error)}`)
      })
    })
  }

  function releaseClosedNativeDocuments(documentIds: string[]) {
    const nativeDocumentIds = documentIds
      .map((documentId) => getDocument(documentId)?.nativeId ?? null)
      .filter((documentId): documentId is string => documentId !== null)

    if (!nativeDocumentIds.length) {
      return
    }

    void closeNativeDocuments(nativeDocumentIds).catch(() => {
      // Closing native handles is best-effort; the next open/save will resync watcher state.
    })
  }

  async function openWorkspaceFile(entry: WorkspaceEntryRef, paneId = activePaneId.value) {
    if (!workspace.value || entry.kind !== 'file') {
      return
    }

    setSelectedPath(entry.path)

    await runFileTask(async () => {
      const document = await openTextFileByPath(workspace.value!.id, entry.path)
      openLoadedDocument(document, paneId)
    }, 'Could not open workspace file')
  }

  async function openEntryInRight(entry: WorkspaceEntryRef) {
    setSplitEnabled(true)
    await openWorkspaceFile(entry, 'right')
  }

  function moveActiveDocumentToRight() {
    const document = activeDocument.value
    const sourcePane = activePane.value

    if (!document || !sourcePane || sourcePane.id === 'right') {
      setSplitEnabled(true)
      return
    }

    moveDocumentToPane(document, sourcePane.id, 'right')
  }

  async function saveDocument(document = activeDocument.value, reason: 'manual' | 'autosave' = 'manual') {
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

      errorMessage.value = 'Resolve the external file conflict before saving to the original path.'
      return
    }

    await runFileTask(async () => {
      flushVisibleDocumentViews(document.id)
      const currentDocument = getDocument(document.id)

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
    return appSettings.value.autosave.enabled &&
      isDirty(document) &&
      document.nativeId !== null &&
      document.externalState === 'idle' &&
      document.saveState !== 'queued' &&
      document.saveState !== 'saving' &&
      document.saveState !== 'error' &&
      !hasUnsafeUnacknowledgedVisualState(document)
  }

  function clearPendingAutosave(documentId: string) {
    const timeoutId = pendingAutosaves.get(documentId)

    if (timeoutId === undefined) {
      return
    }

    window.clearTimeout(timeoutId)
    pendingAutosaves.delete(documentId)
  }

  function scheduleAutosave(document: OpenDocument) {
    clearPendingAutosave(document.id)

    if (!canAutosaveDocument(document)) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      pendingAutosaves.delete(document.id)
      const currentDocument = getDocument(document.id)

      if (!currentDocument || !canAutosaveDocument(currentDocument)) {
        return
      }

      void saveDocument(currentDocument, 'autosave')
    }, appSettings.value.autosave.debounceMs)

    pendingAutosaves.set(document.id, timeoutId)
  }

  function syncDocumentExternalStateFromSaveError(documentId: string, error: NativeError) {
    if (error.code === 'file_changed_externally') {
      markDocumentConflict(documentId, 'The file changed on disk before Folden could save it.')
      return
    }

    if (error.code === 'not_found') {
      markDocumentMissing(documentId, 'The original file is no longer available on disk.')
    }
  }

  function syncAutosaveTimers() {
    const documentIds = new Set(documents.value.map((document) => document.id))

    for (const documentId of pendingAutosaves.keys()) {
      if (!documentIds.has(documentId)) {
        clearPendingAutosave(documentId)
      }
    }

    for (const document of documents.value) {
      if (canAutosaveDocument(document)) {
        scheduleAutosave(document)
      } else {
        clearPendingAutosave(document.id)
      }
    }
  }

  async function saveDocumentAsCopy(document = activeDocument.value) {
    if (!document) {
      return
    }

    await runFileTask(async () => {
      flushVisibleDocumentViews(document.id)
      const currentDocument = getDocument(document.id)

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
      const document = getDocument(documentId)

      if (!document || !isDirty(document)) {
        continue
      }

      await saveDocument(document)

      const nextDocument = getDocument(documentId)

      if (nextDocument && isDirty(nextDocument)) {
        return false
      }
    }

    return documentIds.every((documentId) => {
      const document = getDocument(documentId)
      return !document || !isDirty(document)
    })
  }

  function removeDocumentView(pane: EditorPane, documentId: string) {
    const { removedDocumentIds } = removeDocumentFromPane(pane.id, documentId)

    if (!removedDocumentIds.length) {
      return
    }

    clearRemoteImagePermissions(removedDocumentIds)
    releaseClosedNativeDocuments(removedDocumentIds)
    removeDocuments(removedDocumentIds)
  }

  async function closeDocument(pane: EditorPane, documentId: string) {
    flushPaneEditorContent(pane.id)

    const document = getDocument(documentId)

    if (!document) {
      removeDocumentView(pane, documentId)
      return
    }

    if (!shouldPromptToDiscardDocument(getPaneSnapshot(), documentId, isDirty(document))) {
      removeDocumentView(pane, documentId)
      return
    }

    const decision = await openUnsavedDialog({
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

      const nextDocument = getDocument(documentId)

      if (nextDocument && isDirty(nextDocument)) {
        return
      }
    }

    removeDocumentView(pane, documentId)
  }

  async function createWorkspaceFile(parentPath = selectedDirectoryPath.value) {
    if (!workspace.value || parentPath === null) {
      return
    }

    const name = await openPromptDialog({
      title: 'Create file',
      message: 'Enter a name for the new file.',
      initialValue: 'Untitled.md',
      placeholder: 'Untitled.md',
      confirmLabel: 'Create',
      inputLabel: 'File name',
      validate: validateEntryName,
      normalize: normalizePromptValue,
    })

    if (!name) {
      return
    }

    await runFileTask(async () => {
      const path = await createFile(workspace.value!.id, parentPath, name)
      await refreshWorkspaceBranch(parentPath)
      const document = await openTextFileByPath(workspace.value!.id, path)
      openLoadedDocument(document)
    }, 'Could not create file')
  }

  async function createWorkspaceDirectory(parentPath = selectedDirectoryPath.value) {
    if (!workspace.value || parentPath === null) {
      return
    }

    const name = await openPromptDialog({
      title: 'Create folder',
      message: 'Enter a name for the new folder.',
      initialValue: 'New Folder',
      placeholder: 'New Folder',
      confirmLabel: 'Create',
      inputLabel: 'Folder name',
      validate: validateEntryName,
      normalize: normalizePromptValue,
    })

    if (!name) {
      return
    }

    await runFileTask(async () => {
      await createDirectory(workspace.value!.id, parentPath, name)
      await refreshWorkspaceBranch(parentPath)
    }, 'Could not create folder')
  }

  async function renameWorkspacePath(entry: WorkspaceEntryRef) {
    if (!workspace.value) {
      return
    }

    const newName = await openPromptDialog({
      title: 'Rename',
      message: `Enter a new name for ${entry.name}.`,
      initialValue: entry.name,
      placeholder: entry.name,
      confirmLabel: 'Rename',
      inputLabel: 'Name',
      validate: validateEntryName,
      normalize: normalizePromptValue,
    })

    if (!newName || newName === entry.name) {
      return
    }

    await runFileTask(async () => {
      const nextPath = await renamePath(workspace.value!.id, entry.path, newName)
      remapWorkspacePathState(entry.path, nextPath)
      updateDocumentPaths(entry.path, nextPath, workspace.value!.rootPath)
      setSelectedPath(nextPath)
      await refreshWorkspaceBranch(parentPath(nextPath) ?? '')
    }, 'Could not rename path')
  }

  async function trashWorkspacePath(entry: WorkspaceEntryRef) {
    if (!workspace.value) {
      return
    }

    const workspaceId = workspace.value.id
    const affectedDocuments = documents.value.filter((document) =>
      document.workspaceId === workspaceId &&
      document.relativePath ? isSameOrChildPath(document.relativePath, entry.path) : false,
    )
    const hasDirtyDocument = affectedDocuments.some(isDirty)
    if (hasDirtyDocument) {
      const decision = await openUnsavedDialog({
        title: `Move ${entry.name} to trash?`,
        message: `Save changes before moving ${entry.name} to trash?`,
        saveLabel: 'Save and move',
        discardLabel: 'Move without saving',
        cancelLabel: 'Cancel',
        showSave: true,
      })

      if (decision === 'cancel') {
        return
      }

      if (decision === 'save') {
        const saved = await saveDirtyDocuments(affectedDocuments.map((document) => document.id))

        if (!saved) {
          return
        }
      }
    } else {
      const confirmed = await openConfirmDialog({
        title: `Move ${entry.name} to trash?`,
        message: `Move ${entry.name} to trash?`,
        confirmLabel: 'Move to trash',
        cancelLabel: 'Cancel',
        confirmTone: 'danger',
      })

      if (!confirmed) {
        return
      }
    }

    await runFileTask(async () => {
      await trashPath(workspace.value!.id, entry.path)
      removeWorkspacePathState(entry.path)
      removeDocumentsFromPanes(affectedDocuments.map((document) => document.id))
      setSelectedPath(null)
      await refreshWorkspaceBranch(parentPath(entry.path) ?? '')
    }, 'Could not move path to trash')
  }

  function removeDocumentsFromPanes(documentIds: string[]) {
    const { removedDocumentIds } = removeDocumentsFromPaneState(documentIds)
    clearRemoteImagePermissions(removedDocumentIds)
    releaseClosedNativeDocuments(removedDocumentIds)
    removeDocuments(removedDocumentIds)
  }

  function clearRestoredLayout() {
    const currentDocumentIds = documents.value.map((document) => document.id)
    clearRemoteImagePermissions(currentDocumentIds)
    releaseClosedNativeDocuments(currentDocumentIds)
    removeDocuments(currentDocumentIds)
    clearLayout()
    setSelectedPath(null)
  }

  async function restoreDocumentFromSession(
    record: PersistedSessionState['documents'][number],
  ) {
    if (record.kind === 'scratch') {
      return createDocumentDraft('', record.name)
    }

    if (
      workspace.value &&
      record.workspaceRootPath &&
      normalizePath(workspace.value.rootPath) === normalizePath(record.workspaceRootPath) &&
      record.relativePath
    ) {
      return openDocumentState(await openTextFileByPath(workspace.value.id, record.relativePath))
    }

    if (!record.path) {
      return null
    }

    return openDocumentState(await openTextFileAtPath(record.path))
  }

  function ensureSessionFallbackDocument() {
    if (documents.value.length > 0) {
      return
    }

    const fallbackDocument = createDocumentDraft(initialText, 'Untitled.md')
    setFallbackDocument(fallbackDocument)
  }

  async function restoreSessionSnapshot() {
    const diagnostics: string[] = []
    const [session, recoveryLoadResult] = await Promise.all([
      loadSessionState(),
      loadRecoverySnapshots(),
    ])
    setPendingRecoveryEntries(recoveryLoadResult.entries)

    if (recoveryLoadResult.diagnostics.length > 0) {
      diagnostics.push(...recoveryLoadResult.diagnostics)
    }

    if (!session) {
      await inspectRecoverySnapshots(new Map())
      markRestoreComplete()
      await persistSessionAndRecoveryState()
      if (diagnostics.length > 0) {
        errorMessage.value = diagnostics.join(' ')
      }
      return
    }

    clearRestoredLayout()

    if (session.workspaceRootPath) {
      try {
        await loadWorkspace(await restoreWorkspaceByPath(session.workspaceRootPath))
      } catch (error) {
        diagnostics.push(`Could not restore workspace: ${formatError(error)}`)
      }
    }

    const documentIdByKey = new Map<string, string>()

    for (const record of session.documents) {
      try {
        const document = await restoreDocumentFromSession(record)

        if (!document) {
          continue
        }

        documentIdByKey.set(record.key, document.id)
      } catch (error) {
        diagnostics.push(`Could not restore ${record.name}: ${formatError(error)}`)
      }
    }

    const nextPaneModes: Record<string, EditorMode> = {}

    for (const modeRecord of session.paneModes) {
      const documentId = documentIdByKey.get(modeRecord.documentKey)

      if (!documentId) {
        continue
      }

      nextPaneModes[paneDocumentModeKey(modeRecord.paneId, documentId)] = modeRecord.mode
    }

    const restoredDocumentIds = restoreLayout(
      session.panes.map((paneRecord) => {
        const documentIds = paneRecord.documentKeys
          .map((key) => documentIdByKey.get(key) ?? null)
          .filter((documentId): documentId is string => documentId !== null)

        return {
          id: paneRecord.id,
          documentIds,
          activeDocumentId: paneRecord.activeDocumentKey
            ? documentIdByKey.get(paneRecord.activeDocumentKey) ?? documentIds.at(-1) ?? null
            : documentIds.at(-1) ?? null,
        }
      }),
      nextPaneModes,
      session.splitEnabled,
      session.activePaneId,
      getDocument,
    )

    for (const documentId of documentIdByKey.values()) {
      if (!restoredDocumentIds.has(documentId)) {
        const document = getDocument(documentId)

        if (document) {
          addDocumentToPane(document, 'left')
        }
      }
    }

    ensureSessionFallbackDocument()

    if (diagnostics.length > 0) {
      errorMessage.value = diagnostics.join(' ')
    }

    await inspectRecoverySnapshots(documentIdByKey)
    markRestoreComplete()
    await persistSessionAndRecoveryState()
  }

  async function ensureRecoveryDocument(
    entry: RecoverySnapshot,
    documentIdByKey: Map<string, string>,
  ) {
    const knownDocumentId = documentIdByKey.get(entry.key)

    if (knownDocumentId) {
      return getDocument(knownDocumentId)
    }

    if (entry.kind === 'scratch') {
      const scratchDocument = createDocumentDraft('', entry.name)
      addDocumentToPane(scratchDocument, 'left')
      documentIdByKey.set(entry.key, scratchDocument.id)
      return scratchDocument
    }

    if (
      workspace.value &&
      entry.workspaceRootPath &&
      normalizePath(workspace.value.rootPath) === normalizePath(entry.workspaceRootPath) &&
      entry.relativePath
    ) {
      const document = openDocumentState(await openTextFileByPath(workspace.value.id, entry.relativePath))
      addDocumentToPane(document, 'left')
      documentIdByKey.set(entry.key, document.id)
      return document
    }

    if (!entry.path) {
      return null
    }

    const document = openDocumentState(await openTextFileAtPath(entry.path))
    addDocumentToPane(document, 'left')
    documentIdByKey.set(entry.key, document.id)
    return document
  }

  function applyRecoverySnapshotToDocument(document: OpenDocument, entry: RecoverySnapshot) {
    document.fileFormat = entry.fileFormat
    const nextDocument = applyDocumentUpdate(document.id, document.revision, entry.content)

    if (nextDocument) {
      enforceDocumentVisualSafety(nextDocument)
    }
  }

  async function inspectRecoverySnapshots(documentIdByKey: Map<string, string>) {
    for (const entry of [...pendingRecoveryEntries.value]) {
      let currentDocument: OpenDocument | null = null

      try {
        currentDocument = await ensureRecoveryDocument(entry, documentIdByKey)
      } catch {
        currentDocument = null
      }

      if (entry.kind === 'saved' && currentDocument && currentDocument.content === entry.content) {
        removePendingRecoveryEntry(entry.key)
        continue
      }

      const decision = await openRecoveryDialog({
        title: `Recovered changes for ${entry.name}`,
        message: currentDocument
          ? `Folden found unsaved changes for ${entry.name}.`
          : `Folden found unsaved changes, but the original file could not be reopened automatically.`,
        details: entry.path ?? null,
      })

      if (decision === 'later') {
        continue
      }

      removePendingRecoveryEntry(entry.key)

      if (decision === 'discard') {
        continue
      }

      if (decision === 'open-copy') {
        const copyDocument = createDocumentDraft('', recoveredCopyName(entry.name))
        addDocumentToPane(copyDocument, 'left')
        applyRecoverySnapshotToDocument(copyDocument, entry)
        continue
      }

      const targetDocument = currentDocument ?? await ensureRecoveryDocument(entry, documentIdByKey)

      if (!targetDocument) {
        const copyDocument = createDocumentDraft('', recoveredCopyName(entry.name))
        addDocumentToPane(copyDocument, 'left')
        applyRecoverySnapshotToDocument(copyDocument, entry)
        continue
      }

      applyRecoverySnapshotToDocument(targetDocument, entry)
    }
  }

  function workspaceRelativePathFromAbsolute(path: string) {
    return getWorkspaceRelativePathFromAbsolute(path, cleanDisplayPath)
  }

  async function loadCurrentDiskDocument(document: OpenDocument) {
    if (!document.path) {
      return null
    }

    return (
      workspace.value &&
      document.workspaceId === workspace.value.id &&
      document.relativePath
    )
      ? await openTextFileByPath(workspace.value.id, document.relativePath)
      : await openTextFileAtPath(document.path)
  }

  function openConflictCopy(document: OpenDocument) {
    const previousActivePane = activePane.value
    const previousActiveDocumentId = previousActivePane?.activeDocumentId ?? null
    const copyDocument = createDocumentDraft(document.content, conflictedCopyName(document.name))
    copyDocument.fileFormat = document.fileFormat
    addDocumentToPane(copyDocument, 'left')

    if (previousActivePane && previousActiveDocumentId) {
      setActiveDocument(previousActivePane, previousActiveDocumentId)
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
    const document = acknowledgeDocumentConflict(documentId, fingerprint)

    if (document) {
      enforceDocumentVisualSafety(document)
      updateDocumentSessions(document.id, document.revision)
    }
  }

  async function openConflictResolution(documentId: string) {
    const document = getDocument(documentId)

    if (!document?.path) {
      return
    }

    flushVisibleDocumentViews(documentId)

    const currentDocument = getDocument(documentId)

    if (!currentDocument?.path) {
      return
    }

    const diskDocument = await loadCurrentDiskDocument(currentDocument)

    if (!diskDocument) {
      return
    }

    const decision = await openConflictDialog({
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
      const latestDocument = getDocument(documentId)

      if (!latestDocument) {
        return
      }

      if (isDirty(latestDocument) && latestDocument.content !== diskDocument.content) {
        openConflictCopy(latestDocument)
      }

      const reloadedDocument = replaceDocumentFromDisk(documentId, diskDocument)

      if (reloadedDocument) {
        enforceDocumentVisualSafety(reloadedDocument)
        updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
      }

      return
    }

    if (decision.kind === 'keep-folden') {
      resolveConflictWithCurrentContent(documentId, diskDocument.fingerprint)
      return
    }

    if (decision.content === diskDocument.content) {
      const reloadedDocument = replaceDocumentFromDisk(documentId, diskDocument)

      if (reloadedDocument) {
        enforceDocumentVisualSafety(reloadedDocument)
        updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
      }

      return
    }

    const latestDocument = getDocument(documentId)

    if (!latestDocument) {
      return
    }

    const nextDocument = applyDocumentUpdate(latestDocument.id, latestDocument.revision, decision.content)

    if (nextDocument) {
      nextDocument.diskFingerprint = diskDocument.fingerprint
      nextDocument.saveState = 'idle'
      nextDocument.saveError = null
      nextDocument.externalState = 'idle'
      nextDocument.externalMessage = null
      enforceDocumentVisualSafety(nextDocument)
      updateDocumentSessions(nextDocument.id, nextDocument.revision)
      return
    }

    resolveConflictWithCurrentContent(documentId, diskDocument.fingerprint)
  }

  async function reloadDocumentFromDisk(documentId: string) {
    const document = getDocument(documentId)

    if (!document?.path) {
      return
    }

    const loadedDocument = await loadCurrentDiskDocument(document)

    if (!loadedDocument) {
      return
    }

    const reloadedDocument = replaceDocumentFromDisk(documentId, loadedDocument)

    if (reloadedDocument) {
      enforceDocumentVisualSafety(reloadedDocument)
      updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
    }
  }

  function scheduleDocumentReload(documentId: string) {
    scheduleDocumentReloadDebounced(documentId, () => {
      void reloadDocumentFromDisk(documentId).catch((error) => {
        const document = getDocument(documentId)

        if (document) {
          markDocumentConflict(documentId, `Could not reload external changes: ${formatError(error)}`)
        }
      })
    })
  }

  function handleExternalFileEvent(event: NativeFsEvent) {
    routeExternalFileEvent(event, {
      findDocumentByPath,
      workspaceRelativePathFromAbsolute,
      scheduleWorkspaceRefresh,
      scheduleDocumentReload,
      markDocumentMissing,
      markDocumentConflict,
      clearDocumentExternalState,
    })
  }

  function isSameOrChildPath(path: string, parent: string) {
    const normalizedPath = normalizePath(path)
    const normalizedParent = normalizePath(parent)

    return (
      normalizedPath === normalizedParent ||
      normalizedPath.startsWith(`${normalizedParent}\\`)
    )
  }

  async function runFileTask(task: () => Promise<void>, message: string) {
    errorMessage.value = null
    isFileBusy.value = true

    try {
      await task()
    } catch (error) {
      errorMessage.value = `${message}: ${formatError(error)}`

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'operation' in error &&
        'userMessage' in error
      ) {
        const nativeError = error as {
          code: string
          operation: string
          userMessage: string
          retryable?: boolean
        }
        void logFrontendEvent(
          'warn',
          `native_error operation=${nativeError.operation} code=${nativeError.code} retryable=${nativeError.retryable ? 'true' : 'false'} message=${nativeError.userMessage}`,
        )
      } else {
        void logFrontendEvent('error', `${message}: ${formatError(error)}`)
      }
    } finally {
      isFileBusy.value = false
    }
  }

  function isTauriRuntime() {
    return '__TAURI_INTERNALS__' in window
  }

  async function confirmWindowClose(): Promise<WindowCloseDecision> {
    const dirtyDocumentIds = dirtyDocuments.value.map((document) => document.id)

    if (!dirtyDocumentIds.length) {
      return 'clean'
    }

    const decision = await openUnsavedDialog({
      title: 'Close Folden?',
      message: `Save changes to ${dirtyDocumentIds.length} unsaved ${dirtyDocumentIds.length === 1 ? 'document' : 'documents'} before closing?`,
      saveLabel: 'Save all',
      discardLabel: 'Discard changes',
      cancelLabel: 'Cancel',
      showSave: true,
    })

    if (decision === 'cancel') {
      return 'cancel'
    }

    if (decision === 'save') {
      return (await saveDirtyDocuments(dirtyDocumentIds)) ? 'save' : 'cancel'
    }

    return 'discard'
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirtyDocuments.value.length) {
      return
    }

    event.preventDefault()
    event.returnValue = ''
  }

  async function exportDiagnosticReport() {
    await runFileTask(async () => {
      const exportedPath = await exportDiagnostics()
      setWatcherWarning(`Diagnostics exported to ${cleanDisplayPath(exportedPath)}`)
    }, 'Could not export diagnostics')
  }

  const commandController = createCommandController([
    {
      id: 'document.save',
      title: 'Save Document',
      shortcuts: [{ code: 'KeyS', mod: true }],
      canExecute: canSaveActiveDocument,
      execute: () => saveDocument(),
    },
    {
      id: 'document.undo',
      title: 'Undo',
      shortcuts: [{ code: 'KeyZ', mod: true }],
      canExecute: canUndoActiveDocument,
      execute: () => runDocumentUndo(),
    },
    {
      id: 'document.redo',
      title: 'Redo',
      shortcuts: [
        { code: 'KeyZ', mod: true, shift: true },
        { code: 'KeyY', mod: true },
      ],
      canExecute: canRedoActiveDocument,
      execute: () => runDocumentRedo(),
    },
    {
      id: 'workspace.open',
      title: 'Open Workspace',
      shortcuts: [{ code: 'KeyO', mod: true, shift: true }],
      canExecute: () => !isFileBusy.value,
      execute: () => openWorkspace(),
    },
    {
      id: 'document.open',
      title: 'Open Document',
      shortcuts: [{ code: 'KeyO', mod: true }],
      canExecute: () => !isFileBusy.value,
      execute: () => openNativeDocument(),
    },
    {
      id: 'document.new',
      title: 'New Scratch Document',
      shortcuts: [{ code: 'KeyN', mod: true }],
      execute: () => createScratchDocument(),
    },
    {
      id: 'workspace.createFile',
      title: 'New File',
      canExecute: () => workspace.value !== null,
      execute: () => createWorkspaceFile(),
    },
    {
      id: 'workspace.createDirectory',
      title: 'New Folder',
      canExecute: () => workspace.value !== null,
      execute: () => createWorkspaceDirectory(),
    },
    {
      id: 'logs.open',
      title: 'Open Logs Folder',
      canExecute: () => hasNativeRuntimeOnStartup,
      execute: () => openLogsFolder(),
    },
    {
      id: 'diagnostics.export',
      title: 'Export Diagnostics',
      canExecute: () => hasNativeRuntimeOnStartup,
      execute: () => exportDiagnosticReport(),
    },
    {
      id: 'layout.toggleSplit',
      title: 'Toggle Split View',
      shortcuts: [{ code: 'Backslash', mod: true }],
      execute: () => setSplitEnabled(!splitEnabled.value),
    },
    {
      id: 'layout.moveViewRight',
      title: 'Move Active Tab Right',
      shortcuts: [{ code: 'ArrowRight', mod: true, shift: true }],
      canExecute: () => activeDocument.value !== null,
      execute: () => moveActiveDocumentToRight(),
    },
  ] satisfies AppCommand[])
  const {
    canExecuteCommand,
    executeCommand,
    handleGlobalKeydown,
  } = commandController

  watch(
    appSettings,
    (settings) => {
      saveApplicationSettings(settings)
      syncAutosaveTimers()

      if (workspace.value) {
        void refreshWorkspace().catch((error) => {
          setWatcherWarning(`Could not refresh workspace after settings change: ${formatError(error)}`)
        })
      }
    },
    { deep: true },
  )

  watch(
    () => documents.value.map((document) => ({
      id: document.id,
      revision: document.revision,
      persistedRevision: document.persistedRevision,
      nativeId: document.nativeId,
      externalState: document.externalState,
      saveState: document.saveState,
    })),
    () => {
      syncAutosaveTimers()
    },
    { deep: true },
  )

  watch(
    () => ({
      workspaceRootPath: workspace.value?.rootPath ?? null,
      splitEnabled: splitEnabled.value,
      activePaneId: activePaneId.value,
      panes: panes.value.map((pane) => ({
        id: pane.id,
        documentIds: [...pane.documentIds],
        activeDocumentId: pane.activeDocumentId,
      })),
      paneModes: { ...paneDocumentModes.value },
      documents: documents.value.map((document) => ({
        id: document.id,
        name: document.name,
        path: document.path,
        workspaceId: document.workspaceId,
        relativePath: document.relativePath,
        content: document.content,
        revision: document.revision,
        persistedRevision: document.persistedRevision,
        fileFormat: document.fileFormat,
        fingerprint: document.diskFingerprint,
      })),
      pendingRecoveryEntries: pendingRecoveryEntries.value.map((entry) => ({
        key: entry.key,
        updatedAtMs: entry.updatedAtMs,
      })),
    }),
    () => {
      scheduleSessionPersistence()
    },
    { deep: true },
  )

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown)
    window.addEventListener('beforeunload', handleBeforeUnload)

    if (!hasNativeRuntimeOnStartup) {
      markRestoreComplete()
      return
    }

    void restoreSessionSnapshot().catch((error) => {
      markRestoreComplete()
      errorMessage.value = `Could not restore the previous session: ${formatError(error)}`
    })

    void listen<NativeFsEvent>('folden://fs-event', (event) => {
      handleExternalFileEvent(event.payload)
    }).then((unlisten) => {
      setFsEventUnlisten(unlisten)
    })

    void listen<string | null>('folden://watcher-warning', (event) => {
      setWatcherWarning(event.payload)
    }).then((unlisten) => {
      setWatcherWarningUnlisten(unlisten)
    })

    let isProgrammaticWindowClose = false

    void getCurrentWindow().onCloseRequested(async (event) => {
      if (isProgrammaticWindowClose) {
        return
      }

      event.preventDefault()

      const closeDecision = await confirmWindowClose()

      if (closeDecision === 'cancel') {
        return
      }

      try {
        if (closeDecision === 'discard') {
          const discardedKeys = new Set(
            dirtyDocuments.value.map((document) => buildSessionDocumentKey(document, normalizePath)),
          )
          discardPendingRecoveryEntries(discardedKeys)
          await saveSessionState(buildPersistedSessionState())
          await saveRecoverySnapshots(buildPersistedRecoverySnapshots(discardedKeys))
        } else {
          await persistSessionAndRecoveryState()
        }
      } catch (error) {
        errorMessage.value = `Could not finalize session data: ${formatError(error)}`
        return
      }

      isProgrammaticWindowClose = true

      try {
        await getCurrentWindow().destroy()
      } finally {
        isProgrammaticWindowClose = false
      }
    }).then((unlisten) => {
      tauriWindowCloseUnlisten = unlisten
    })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGlobalKeydown)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    tauriWindowCloseUnlisten?.()
    disposeExternalChangesController()

    disposeSessionController()

    for (const timeoutId of pendingAutosaves.values()) {
      window.clearTimeout(timeoutId)
    }
  })

  return {
    activeDocument,
    activeLocation,
    activePaneId,
    activePath,
    appSettings,
    cleanDisplayPath,
    closeDocument,
    canExecuteCommand,
    clearDocumentExternalState,
    clearSidebarSelection,
    confirmDialog,
    conflictDialog,
    createScratchDocument,
    createWorkspaceDirectory,
    createWorkspaceFile,
    dirtyDocuments,
    documents,
    errorMessage,
    executeCommand,
    expandedWorkspacePaths,
    getDocument,
    getDocumentMode,
    getViewSessionId,
    handleDocumentUpdate,
    hasNativeRuntimeOnStartup,
    isDirty,
    isFileBusy,
    isMarkdownPath,
    allowRemoteImagesForDocument,
    documentHasRemoteImages,
    loadWorkspace,
    loadingWorkspacePaths,
    markdownSafetyDialog,
    moveActiveDocumentToRight,
    openConflictResolution,
    openEntryInRight,
    exportDiagnosticReport,
    openLogsFolder,
    openNativeDocument,
    openWorkspace,
    openWorkspaceFile,
    promptDialog,
    promptDialogError,
    recentWorkspaces,
    recoveryDialog,
    reloadDocumentFromDisk,
    renameWorkspacePath,
    resolveConfirmDialog,
    resolveConflictDialog,
    resolveMarkdownSafetyDialog,
    resolveRecoveryDialog,
    resolveUnsavedDialog,
    restoreWorkspaceByPath,
    runFileTask,
    saveDocument,
    saveDocumentAsCopy,
    selectedPath,
    setSelectedPath,
    setActiveDocument,
    setActivePane,
    setPaneDocumentMode,
    setPaneEditorAdapter,
    setSplitEnabled,
    splitEnabled,
    shouldLoadRemoteImages,
    submitPromptDialog,
    cancelPromptDialog,
    toggleWorkspaceDirectory,
    trashWorkspacePath,
    unsavedDialog,
    visiblePanes,
    watcherWarning,
    workspace,
    workspaceLoadErrors,
    workspaceNameFromPath,
  }
}
