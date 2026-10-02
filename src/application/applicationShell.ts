import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { language, t } from './i18n'
import { createDocumentFeaturesController } from './controllers/documentFeaturesController'
import { createDialogController } from './controllers/dialogController'
import { createPaneController } from './controllers/paneController'
import type { NativeFsEvent } from '../domain/native'
import { type EditorMode, type OpenDocument } from '../domain/documents/documentState'
import {
  loadApplicationSettings,
  loadLayoutSettings,
  saveApplicationSettings,
  saveLayoutSettings,
} from '../infrastructure/settings/settings'
import {
  cleanDisplayPath,
  isMarkdownDocument,
  isMarkdownPath,
  normalizePath,
  parentPath,
  workspaceNameFromPath,
} from './helpers/pathHelpers'
import { formatError } from './helpers/errorHelpers'
import { createWorkspaceController } from './controllers/workspaceController'
import { createDocumentController } from './controllers/documentController'
import { createExternalChangesController } from './controllers/externalChangesController'
import { createSessionController } from './controllers/sessionController'
import { createDocumentWorkflowController } from './controllers/documentWorkflowController'
import { createApplicationLifecycleController } from './controllers/applicationLifecycleController'
import { createWorkspaceWorkflowController } from './controllers/workspaceWorkflowController'
import { createVisualSafetyController } from './controllers/visualSafetyController'
import { createApplicationCommandController } from './controllers/applicationCommandController'
import { createLayoutController } from './controllers/layoutController'
import { createDocumentAnalysisController } from './controllers/documentAnalysisController'
import { createTauriNativePorts } from '../infrastructure/tauri/nativePorts'
import type { EditorCommand, EditorPane } from './types/shell'
export type { EditorAdapter, EditorCommand } from './types/shell'

function normalizeEditorLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

export function useApplicationShell() {
  const initialText = ''
  const hasNativeRuntimeOnStartup = isTauriRuntime()
  const nativePorts = createTauriNativePorts()
  const appSettings = ref(loadApplicationSettings())
  watch(
    () => appSettings.value.language,
    (value) => {
      language.value = value
    },
    { immediate: true },
  )
  const layoutController = createLayoutController({
    appSettings,
    loadLayoutSettings,
    saveLayoutSettings,
  })
  const {
    layoutSettings,
    setActivitySection,
    closeSidebar,
    setActivityRailMode,
    resetLayoutSettings,
    setSidebarWidth,
    setActivityRailWidth,
    resetActivityRailWidth,
    setSplitRatio,
    setOutlineWidth,
    setDocumentMapWidth,
    toggleDocumentOutline,
    toggleDocumentMap,
    toggleFocusMode,
    dispose: disposeLayoutController,
  } = layoutController
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
    loadingWorkspacePaths,
    workspaceLoadErrors,
    loadedWorkspacePaths,
    selectedPath,
    recentWorkspaces,
    workspaceSettings,
    setWorkspacePathLoading,
    setWorkspacePathExpanded,
    clearWorkspaceLoadError,
    setWorkspaceLoadError,
    removeWorkspacePathState,
    remapWorkspacePathState,
    clearSidebarSelection,
    setSelectedPath,
    setWatcherVisibleWorkspace,
    setWorkspaceSettings,
    addIgnoredWorkspacePath,
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
    paneEditors,
    visiblePanes,
    activePane,
    getPane,
    setActivePane,
    paneDocumentModeKey,
    getDocumentMode,
    ensureViewSession,
    getViewSession,
    getViewSessionId,
    updateEditorViewSession,
    setActiveDocument: setActiveDocumentInPaneState,
    setPaneEditorAdapter,
    setDocumentMode,
    setOpenDocumentMode,
    addDocumentToPane: addDocumentToPaneState,
    applyDocumentUpdateToSessions,
    updateDocumentSessions,
    setSplitEnabled,
    moveDocumentToPane,
    moveDocumentIdToPane,
    normalizePaneState,
    removeDocumentFromPane,
    removeDocumentsFromPanes: removeDocumentsFromPaneState,
    reorderDocumentInPane,
    clearLayout,
    setFallbackDocument,
    restoreLayout,
    getPaneSnapshot,
  } = paneController
  if (appSettings.value.editor.defaultMarkdownMode === 'source') {
    initialDocument.defaultMode = 'source'
    setOpenDocumentMode(initialDocument.id, 'source')
  }
  const errorMessage = ref<string | null>(null)
  const externalChangesController = createExternalChangesController()
  const {
    watcherWarning,
    setWatcherWarning,
    scheduleWorkspaceRefresh: scheduleWorkspaceRefreshDebounced,
    scheduleDocumentReload: scheduleDocumentReloadDebounced,
    handleExternalFileEvent: routeExternalFileEvent,
    dispose: disposeExternalChangesController,
  } = externalChangesController
  const isFileBusy = ref(false)
  const analysisWarning = ref<string | null>(null)
  const documentAnalysisController = createDocumentAnalysisController({
    createWorker: () =>
      new Worker(new URL('../workers/documentAnalysis.worker.ts', import.meta.url), {
        type: 'module',
      }),
    onError: (message) => {
      analysisWarning.value = message
    },
  })
  const documentAnalyses = documentAnalysisController.analyses
  const dialogController = createDialogController()
  const aboutOpen = ref(false)
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
  const visualSafetyController = createVisualSafetyController({
    setOpenDocumentMode,
    openMarkdownSafetyDialog,
  })
  const {
    allowRemoteImagesForDocument,
    clearRemoteImagePermissions,
    confirmVisualMode,
    documentHasRemoteImages,
    enforceDocumentVisualSafety,
    hasUnsafeUnacknowledgedVisualState,
    shouldLoadRemoteImages,
  } = visualSafetyController
  const activeDocument = computed(() => {
    if (!activePane.value?.activeDocumentId) {
      return null
    }

    return getDocument(activePane.value.activeDocumentId)
  })
  const activeEditorAdapter = computed(() => paneEditors.value[activePaneId.value] ?? null)
  const activeDocumentMode = computed(() => {
    if (!activePane.value?.activeDocumentId || !activeDocument.value) {
      return null
    }

    return getDocumentMode(activePane.value, activeDocument.value)
  })
  const activeDocumentWordCount = computed(() =>
    activeDocument.value ? (documentAnalyses.value[activeDocument.value.id]?.wordCount ?? 0) : 0,
  )
  const activePath = computed(() => {
    if (!workspace.value || activeDocument.value?.workspaceId !== workspace.value.id) {
      return null
    }

    return activeDocument.value.relativePath
  })
  const activeLocation = computed(() => {
    if (!activeDocument.value?.path) {
      return t('Scratch')
    }

    return cleanDisplayPath(activeDocument.value.path)
  })
  const selectedDirectoryPath = computed(() => {
    return getSelectedDirectoryPath(parentPath)
  })

  let workspaceWorkflowController: ReturnType<typeof createWorkspaceWorkflowController>

  function applyDefaultMarkdownMode(document: OpenDocument) {
    if (isMarkdownDocument(document)) {
      document.defaultMode = appSettings.value.editor.defaultMarkdownMode
    }

    return document
  }

  function createDocumentDraftWithDefaultMode(content: string, fallbackName?: string) {
    return applyDefaultMarkdownMode(createDocumentDraft(content, fallbackName))
  }

  function openDocumentStateWithDefaultMode(document: Parameters<typeof openDocumentState>[0]) {
    const wasOpen = findDocumentByPath(document.path)
    const opened = openDocumentState(document)
    return wasOpen ? opened : applyDefaultMarkdownMode(opened)
  }

  function refreshWorkspaceBranchForDocuments(
    branchPath: string | null,
    preserveDescendants = true,
  ) {
    return workspaceWorkflowController.refreshWorkspaceBranch(branchPath, preserveDescendants)
  }

  const documentWorkflowController = createDocumentWorkflowController({
    files: nativePorts.documents,
    initialText,
    appSettings,
    activeDocument,
    activePane,
    activePaneId,
    visiblePanes,
    paneEditors,
    workspace,
    isFileBusy,
    errorMessage,
    isDirty,
    hasUnsafeUnacknowledgedVisualState,
    enforceDocumentVisualSafety,
    clearRemoteImagePermissions,
    setSelectedPath,
    refreshWorkspaceBranch: refreshWorkspaceBranchForDocuments,
    runFileTask,
    openUnsavedDialog,
    openConflictDialog,
    getPane,
    getPaneSnapshot,
    setActiveDocument: setActiveDocumentInPaneState,
    addDocumentToPaneState,
    removeDocumentFromPane,
    removeDocumentsFromPaneState,
    ensureViewSession,
    getDocumentMode,
    applyDocumentUpdateToSessions,
    updateDocumentSessions,
    createDocumentDraft: createDocumentDraftWithDefaultMode,
    openDocumentState: openDocumentStateWithDefaultMode,
    getDocument,
    applyDocumentUpdate,
    undoDocument,
    redoDocument,
    markDocumentQueued,
    markDocumentSaving,
    markDocumentSaved,
    markDocumentSaveError,
    replaceDocumentFromDisk,
    markDocumentConflict,
    markDocumentMissing,
    acknowledgeDocumentConflict,
    removeDocuments,
    openWorkspaceFileByPath: nativePorts.documents.openTextFileByPath,
    openAbsoluteTextFile: nativePorts.documents.openTextFileAtPath,
  })
  const {
    addDocumentToPane,
    canRedoActiveDocument,
    canSaveActiveDocument,
    canUndoActiveDocument,
    closeDocument,
    createScratchDocument,
    flushPaneEditorContent,
    handleDocumentUpdate,
    openConflictResolution,
    openLoadedDocument: openLoadedDocumentState,
    openNativeDocument: openNativeDocumentState,
    openWorkspaceFile: openWorkspaceFileState,
    reloadDocumentFromDisk,
    removeDocumentsFromPanes,
    runDocumentRedo,
    runDocumentUndo,
    saveDirtyDocuments,
    saveDocument,
    saveDocumentAsCopy,
    dispose: disposeDocumentWorkflowController,
  } = documentWorkflowController

  function syncAutosaveTimers() {
    documentWorkflowController.syncAutosaveTimers(documents.value)
  }

  async function triggerAutosaveForDocumentSwitch(documentId = activeDocument.value?.id ?? null) {
    if (!documentId || !appSettings.value.autosave.saveOnDocumentSwitch) {
      return
    }

    await documentWorkflowController.triggerAutosaveDocuments([documentId])
  }

  async function triggerAutosaveOnWindowBlur() {
    if (!appSettings.value.autosave.saveOnWindowBlur) {
      return
    }

    await documentWorkflowController.triggerAutosaveDocuments(
      documents.value.map((document) => document.id),
    )
  }

  async function setActiveDocument(pane: EditorPane, documentId: string) {
    const previousDocumentId = activeDocument.value?.id ?? null

    if (previousDocumentId !== documentId) {
      await triggerAutosaveForDocumentSwitch(previousDocumentId)
    }

    setActiveDocumentInPaneState(pane, documentId)
  }

  async function openNativeDocument() {
    await triggerAutosaveForDocumentSwitch()
    await openNativeDocumentState()
  }

  async function openLoadedDocument(
    document: Parameters<typeof openLoadedDocumentState>[0],
    paneId?: EditorPane['id'],
  ) {
    await triggerAutosaveForDocumentSwitch()
    return openLoadedDocumentState(document, paneId)
  }

  async function openWorkspaceFile(
    entry: Parameters<typeof openWorkspaceFileState>[0],
    paneId?: EditorPane['id'],
  ) {
    await triggerAutosaveForDocumentSwitch()
    await openWorkspaceFileState(entry, paneId)
  }

  workspaceWorkflowController = createWorkspaceWorkflowController({
    workspaceFiles: nativePorts.workspace,
    workspace,
    documents,
    expandedWorkspacePaths,
    activeDocument,
    activePane,
    selectedDirectoryPath,
    isDirty,
    runFileTask,
    openUnsavedDialog,
    openConfirmDialog,
    openPromptDialog,
    setWatcherWarning,
    setWatcherVisibleWorkspace,
    setWorkspaceSettings,
    addIgnoredWorkspacePath,
    clearWorkspaceLoadError,
    setWorkspaceLoadError,
    setWorkspacePathLoading,
    setWorkspacePathExpanded,
    removeWorkspacePathState,
    remapWorkspacePathState,
    setSelectedPath,
    applyWorkspaceBranch,
    loadedDescendantPaths,
    shouldLoadBranch,
    nearestLoadedWorkspaceBranch: getNearestLoadedWorkspaceBranch,
    scheduleWorkspaceRefreshDebounced,
    getDocument,
    saveDirtyDocuments,
    removeDocumentsFromPanes,
    normalizePaneState,
    updateDocumentPaths,
    openLoadedDocument,
    openWorkspaceFile,
    setSplitEnabled,
    moveDocumentToPane,
  })
  const {
    createWorkspaceDirectory,
    createWorkspaceFile,
    loadWorkspace,
    moveActiveDocumentToRight,
    openEntryInRight,
    openWorkspace,
    refreshWorkspace,
    renameWorkspacePath,
    hideWorkspacePath,
    scheduleWorkspaceRefresh,
    toggleWorkspaceDirectory,
    trashWorkspacePath,
  } = workspaceWorkflowController

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
      await nativePorts.sessionStorage.saveSessionState(buildPersistedSessionState())
      await nativePorts.sessionStorage.saveRecoverySnapshots(buildPersistedRecoverySnapshots())
    } catch (error) {
      errorMessage.value = t('Could not persist session data: {error}', {
        error: formatError(error),
      })
    }
  }

  async function persistSessionAndRecoveryState() {
    await runSessionPersistence(writeSessionAndRecoveryState)
  }

  function scheduleSessionPersistence() {
    scheduleSessionPersistenceDebounced(writeSessionAndRecoveryState)
  }

  function capturePaneEditorViewState(paneId: EditorPane['id']) {
    const adapter = paneEditors.value[paneId]
    const pane = getPane(paneId)

    if (!adapter?.captureViewState || !pane?.activeDocumentId) {
      return
    }

    updateEditorViewSession(paneId, pane.activeDocumentId, adapter.captureViewState())
  }

  async function setPaneDocumentMode(pane: EditorPane, document: OpenDocument, mode: EditorMode) {
    if (mode === 'visual' && !isMarkdownDocument(document)) {
      return
    }

    if (mode === 'visual' && !(await confirmVisualMode(document))) {
      return
    }

    const activeContent = paneEditors.value[pane.id]?.flushContent()
    const hasOnlyLineEndingChanges =
      activeContent !== undefined &&
      activeContent !== document.content &&
      normalizeEditorLineEndings(activeContent) === normalizeEditorLineEndings(document.content)

    if (getDocumentMode(pane, document) === 'source' && !hasOnlyLineEndingChanges) {
      flushPaneEditorContent(pane.id)
    }

    capturePaneEditorViewState(pane.id)
    setDocumentMode(pane.id, document, mode)
  }

  function clearRestoredLayout() {
    const currentDocumentIds = documents.value.map((document) => document.id)
    clearRemoteImagePermissions(currentDocumentIds)
    removeDocumentsFromPanes(currentDocumentIds)
    removeDocuments(currentDocumentIds)
    clearLayout()
    setSelectedPath(null)
  }

  function workspaceRelativePathFromAbsolute(path: string) {
    return getWorkspaceRelativePathFromAbsolute(path, cleanDisplayPath)
  }

  function runActiveEditorCommand(command: EditorCommand) {
    activeEditorAdapter.value?.runCommand?.(command)
  }

  function moveDocumentIdBetweenPanes(
    documentId: string,
    sourcePaneId: EditorPane['id'],
    targetPaneId: EditorPane['id'],
    targetIndex?: number,
  ) {
    moveDocumentIdToPane(documentId, sourcePaneId, targetPaneId, targetIndex)
  }

  async function openDroppedPath(path: string, paneId: EditorPane['id']) {
    await runFileTask(async () => {
      try {
        const loadedDocument = await nativePorts.documents.openTextFileAtPath(path)
        const document = openDocumentStateWithDefaultMode(loadedDocument)
        addDocumentToPane(document, paneId)
      } catch (documentError) {
        try {
          await loadWorkspace(await restoreWorkspaceByPath(path))
        } catch {
          throw documentError
        }
      }
    }, t('Could not open dropped item'))
  }

  function scheduleDocumentReload(documentId: string) {
    scheduleDocumentReloadDebounced(documentId, () => {
      void reloadDocumentFromDisk(documentId).catch((error) => {
        const document = getDocument(documentId)

        if (document) {
          markDocumentConflict(
            documentId,
            t('Could not reload external changes: {error}', { error: formatError(error) }),
          )
        }
      })
    })
  }

  function handleExternalFileEvent(event: NativeFsEvent) {
    projectSearch.scheduleRefresh()
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
          technicalMessage?: string | null
          retryable?: boolean
        }
        const technicalMessage = nativeError.technicalMessage
          ? ` technical=${nativeError.technicalMessage.slice(0, 240)}`
          : ''
        void nativePorts.diagnostics.logFrontendEvent(
          'warn',
          `native_error operation=${nativeError.operation} code=${nativeError.code} retryable=${nativeError.retryable ? 'true' : 'false'} message=${nativeError.userMessage}${technicalMessage}`,
        )
      } else {
        void nativePorts.diagnostics.logFrontendEvent('error', `${message}: ${formatError(error)}`)
      }
    } finally {
      isFileBusy.value = false
    }
  }

  function isTauriRuntime() {
    return '__TAURI_INTERNALS__' in window
  }

  async function exportDiagnosticReport() {
    await runFileTask(async () => {
      const exportedPath = await nativePorts.diagnostics.exportDiagnostics()
      setWatcherWarning(
        t('Diagnostics exported to {path}', { path: cleanDisplayPath(exportedPath) }),
      )
    }, t('Could not export diagnostics'))
  }
  const openLogsFolder = nativePorts.diagnostics.openLogsFolder
  const restoreWorkspaceByPath = nativePorts.workspace.restoreWorkspaceByPath

  const documentFeaturesController = createDocumentFeaturesController({
    nativePorts,
    workspace,
    documents,
    appSettings,
    ignoredPaths: () => workspaceSettings.value.ignoredPaths,
    activePaneId,
    activeDocument,
    activeEditorAdapter,
    visiblePanes,
    paneEditors,
    selectedDirectoryPath,
    errorMessage,
    getPane,
    getDocument,
    openWorkspaceFile,
    setPaneDocumentMode,
    flushPaneEditorContent,
    shouldLoadRemoteImages,
    openPromptDialog,
    openConfirmDialog,
    createDocumentDraft: createDocumentDraftWithDefaultMode,
    openDocumentState: openDocumentStateWithDefaultMode,
    applyDocumentUpdate,
    addDocumentToPane,
    saveDocument,
    runFileTask,
    refreshWorkspace,
    remapWorkspacePathState,
    updateDocumentPaths,
    setSelectedPath,
  })
  const {
    projectSearch,
    findOpen,
    findReplace,
    findQuery,
    findReplacement,
    findCase,
    findCount,
    findIndex,
    nextFind,
    replaceFind,
    printSnapshot,
    printPending,
    preparePrint,
    createFromTemplate,
    importImage,
    navigateLink,
    navigateHistory,
    navigationHistory,
    navigationIndex,
    moveWorkspacePath,
    dispose: disposeDocumentFeaturesController,
  } = documentFeaturesController
  function hasOpenDialog() {
    return !!(
      promptDialog.value ||
      confirmDialog.value ||
      markdownSafetyDialog.value ||
      conflictDialog.value ||
      recoveryDialog.value ||
      unsavedDialog.value ||
      aboutOpen.value ||
      projectSearch.quickOpen.value ||
      Object.values(paneEditors.value).some((editor) => editor?.hasOpenDialog?.())
    )
  }

  function handleProductKeydown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !(event.ctrlKey || event.metaKey) ||
      hasOpenDialog()
    )
      return
    const key = event.code
    if (key === 'KeyP' && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      if (event.altKey) preparePrint()
      else void projectSearch.showQuickOpen()
    } else if ((key === 'KeyF' || key === 'KeyH') && !event.altKey) {
      event.preventDefault()
      event.stopPropagation()
      if (event.shiftKey && key === 'KeyF') setActivitySection('search')
      else {
        findOpen.value = true
        findReplace.value = key === 'KeyH'
      }
    } else if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      event.preventDefault()
      void navigateHistory(key === 'ArrowLeft' ? -1 : 1)
    }
  }

  const commandController = createApplicationCommandController({
    hasNativeRuntime: hasNativeRuntimeOnStartup,
    hasOpenDialog,
    isFileBusy,
    workspace,
    splitEnabled,
    activeDocument,
    canSaveActiveDocument,
    canUndoActiveDocument,
    canRedoActiveDocument,
    saveDocument: () => saveDocument(),
    runDocumentUndo,
    runDocumentRedo,
    openWorkspace,
    openNativeDocument,
    createScratchDocument,
    createWorkspaceFile: () => createWorkspaceFile(),
    createWorkspaceDirectory: () => createWorkspaceDirectory(),
    openLogsFolder,
    exportDiagnosticReport,
    setSplitEnabled,
    moveActiveDocumentToRight,
  })
  const { canExecuteCommand, executeCommand, handleGlobalKeydown } = commandController

  const applicationLifecycleController = createApplicationLifecycleController({
    documentFiles: nativePorts.documents,
    workspaceFiles: nativePorts.workspace,
    sessionStorage: nativePorts.sessionStorage,
    nativeEvents: nativePorts.events,
    hasNativeRuntime: hasNativeRuntimeOnStartup,
    windowTarget: window,
    errorMessage,
    workspace,
    documents,
    dirtyDocuments,
    paneDocumentModes,
    splitEnabled,
    activePaneId,
    pendingRecoveryEntries,
    handleGlobalKeydown,
    handleExternalFileEvent,
    setWatcherWarning,
    loadWorkspace,
    clearRestoredLayout,
    addDocumentToPane,
    createDocumentDraft: createDocumentDraftWithDefaultMode,
    openDocumentState: openDocumentStateWithDefaultMode,
    getDocument,
    applyDocumentUpdate,
    enforceDocumentVisualSafety,
    setFallbackDocument,
    restoreLayout,
    getPaneSnapshot,
    paneDocumentModeKey,
    isDirty,
    saveDirtyDocuments,
    markRestoreComplete,
    setPendingRecoveryEntries,
    removePendingRecoveryEntry,
    discardPendingRecoveryEntries,
    buildPersistedSessionState,
    buildPersistedRecoverySnapshots,
    persistSessionAndRecoveryState,
    scheduleSessionPersistence,
    disposeSessionController,
    disposeExternalChangesController,
    disposeDocumentWorkflowController,
    openRecoveryDialog,
    openUnsavedDialog,
  })
  const { mount: mountApplicationLifecycle, dispose: disposeApplicationLifecycle } =
    applicationLifecycleController

  let pendingWorkspaceWatchScope: { workspaceId: string | null; loadedPaths: string[] } | null =
    null
  let workspaceWatchScopeSyncActive = false

  async function flushWorkspaceWatchScope() {
    if (workspaceWatchScopeSyncActive) return
    workspaceWatchScopeSyncActive = true
    try {
      while (pendingWorkspaceWatchScope) {
        const scope = pendingWorkspaceWatchScope
        pendingWorkspaceWatchScope = null
        try {
          await nativePorts.workspace.syncWorkspaceWatchScope(scope.workspaceId, scope.loadedPaths)
        } catch (error) {
          setWatcherWarning(
            t('Could not update watcher scope: {error}', { error: formatError(error) }),
          )
        }
      }
    } finally {
      workspaceWatchScopeSyncActive = false
      if (pendingWorkspaceWatchScope) void flushWorkspaceWatchScope()
    }
  }

  watch(
    () => [workspace.value?.id ?? null, [...loadedWorkspacePaths.value].sort()] as const,
    ([workspaceId, loadedPaths]) => {
      pendingWorkspaceWatchScope = { workspaceId, loadedPaths }
      void flushWorkspaceWatchScope()
    },
    { deep: true, immediate: true },
  )

  watch(
    appSettings,
    (settings) => {
      saveApplicationSettings(settings)
      syncAutosaveTimers()

      if (workspace.value) {
        void refreshWorkspace().catch((error) => {
          setWatcherWarning(
            t('Could not refresh workspace after settings change: {error}', {
              error: formatError(error),
            }),
          )
        })
      }
    },
    { deep: true },
  )

  watch(
    () =>
      documents.value.map((document) => ({
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

  watch(
    () =>
      documents.value.map((document) => ({
        documentId: document.id,
        revision: document.revision,
        content: document.content,
        isMarkdown: isMarkdownDocument(document),
      })),
    (requests) => {
      documentAnalysisController.retain(requests.map((request) => request.documentId))
      requests.forEach(documentAnalysisController.request)
    },
    { deep: true, immediate: true },
  )

  onMounted(() => {
    mountApplicationLifecycle(initialText)
    window.addEventListener('keydown', handleProductKeydown, true)
    window.addEventListener('blur', triggerAutosaveOnWindowBlur)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleProductKeydown, true)
    disposeDocumentFeaturesController()
    window.removeEventListener('blur', triggerAutosaveOnWindowBlur)
    disposeLayoutController()
    disposeApplicationLifecycle()
    documentAnalysisController.dispose()
  })

  return {
    aboutOpen,
    projectSearch,
    findOpen,
    findReplace,
    findQuery,
    findReplacement,
    findCase,
    findCount,
    findIndex,
    nextFind,
    replaceFind,
    printSnapshot,
    printPending,
    preparePrint,
    createFromTemplate,
    importImage,
    navigateLink,
    navigateHistory,
    navigationHistory,
    navigationIndex,
    moveWorkspacePath,
    activeDocument,
    activeDocumentMode,
    activeDocumentWordCount,
    analysisWarning,
    activeLocation,
    activePaneId,
    activePath,
    appSettings,
    layoutSettings,
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
    documentAnalyses,
    errorMessage,
    executeCommand,
    expandedWorkspacePaths,
    getDocument,
    getDocumentMode,
    getViewSession,
    getViewSessionId,
    handleDocumentUpdate,
    hasNativeRuntimeOnStartup,
    isDirty,
    isFileBusy,
    isMarkdownDocument,
    isMarkdownPath,
    allowRemoteImagesForDocument,
    documentHasRemoteImages,
    loadWorkspace,
    loadingWorkspacePaths,
    markdownSafetyDialog,
    moveActiveDocumentToRight,
    moveDocumentIdBetweenPanes,
    openDroppedPath,
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
    hideWorkspacePath,
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
    reorderDocumentInPane,
    resetLayoutSettings,
    closeSidebar,
    runActiveEditorCommand,
    setActivitySection,
    setActivityRailMode,
    setActivityRailWidth,
    resetActivityRailWidth,
    setSidebarWidth,
    setSplitRatio,
    setOutlineWidth,
    setDocumentMapWidth,
    toggleDocumentOutline,
    toggleDocumentMap,
    splitEnabled,
    shouldLoadRemoteImages,
    submitPromptDialog,
    cancelPromptDialog,
    toggleFocusMode,
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
