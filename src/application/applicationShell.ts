import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createDialogController } from './controllers/dialogController'
import { createPaneController } from './controllers/paneController'
import type { NativeFsEvent } from '../domain/native'
import {
  type EditorMode,
  type OpenDocument,
} from '../domain/documents/documentState'
import {
  defaultLayoutSettings,
  layoutSettingLimits,
  loadApplicationSettings,
  loadLayoutSettings,
  saveApplicationSettings,
  saveLayoutSettings,
} from '../infrastructure/settings/settings'
import {
  cleanDisplayPath,
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
import { createTauriNativePorts } from '../infrastructure/tauri/nativePorts'
import type { EditorPane } from './types/shell'
import type { VisualEditorCommand } from './types/shell'
export type { EditorAdapter, VisualEditorCommand } from './types/shell'

export function useApplicationShell() {
  const initialText = '# Untitled\n\nStart writing in Folden.\n'
  const hasNativeRuntimeOnStartup = isTauriRuntime()
  const nativePorts = createTauriNativePorts()
  const appSettings = ref(loadApplicationSettings())
  const layoutSettings = ref(loadLayoutSettings())
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
    getViewSessionId,
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
  const activeDocumentWordCount = computed(() => {
    if (!activeDocument.value) {
      return 0
    }

    const words = activeDocument.value.content.trim().match(/\S+/g)
    return words?.length ?? 0
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

  let workspaceWorkflowController: ReturnType<typeof createWorkspaceWorkflowController>

  function applyDefaultMarkdownMode(document: OpenDocument) {
    if (isMarkdownPath(document.path ?? document.name)) {
      setOpenDocumentMode(document.id, appSettings.value.editor.defaultMarkdownMode)
    }

    return document
  }

  function createDocumentDraftWithDefaultMode(content: string, fallbackName?: string) {
    return applyDefaultMarkdownMode(createDocumentDraft(content, fallbackName))
  }

  function openDocumentStateWithDefaultMode(document: Parameters<typeof openDocumentState>[0]) {
    return applyDefaultMarkdownMode(openDocumentState(document))
  }

  function refreshWorkspaceBranchForDocuments(branchPath: string | null, preserveDescendants = true) {
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

    await documentWorkflowController.triggerAutosaveDocuments(documents.value.map((document) => document.id))
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

  async function openLoadedDocument(document: Parameters<typeof openLoadedDocumentState>[0], paneId?: EditorPane['id']) {
    await triggerAutosaveForDocumentSwitch()
    return openLoadedDocumentState(document, paneId)
  }

  async function openWorkspaceFile(entry: Parameters<typeof openWorkspaceFileState>[0], paneId?: EditorPane['id']) {
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
      errorMessage.value = `Could not persist session data: ${formatError(error)}`
    }
  }

  async function persistSessionAndRecoveryState() {
    await runSessionPersistence(writeSessionAndRecoveryState)
  }

  function scheduleSessionPersistence() {
    scheduleSessionPersistenceDebounced(writeSessionAndRecoveryState)
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

  function setActivitySection(section: 'workspace' | 'settings') {
    layoutSettings.value.activeActivitySection = section
    if (section === 'workspace') {
      appSettings.value.appearance.showSidebar = true
    }
  }

  function setActivityRailMode(mode: 'compact' | 'expanded') {
    layoutSettings.value.activityRailMode = mode
  }

  function resetLayoutSettings() {
    layoutSettings.value = structuredClone(defaultLayoutSettings)
    appSettings.value.appearance.showActivityBar = true
    appSettings.value.appearance.showSidebar = true
    appSettings.value.appearance.showStatusBar = true
  }

  function setSidebarWidth(width: number) {
    layoutSettings.value.sidebarWidth = Math.min(
      Math.max(width, layoutSettingLimits.sidebarWidth.min),
      layoutSettingLimits.sidebarWidth.max,
    )
  }

  function setActivityRailWidth(width: number) {
    if (layoutSettings.value.activityRailMode === 'expanded') {
      layoutSettings.value.activityExpandedWidth = Math.min(
        Math.max(width, layoutSettingLimits.activityExpandedWidth.min),
        layoutSettingLimits.activityExpandedWidth.max,
      )
      return
    }

    layoutSettings.value.activityCompactWidth = Math.min(
      Math.max(width, layoutSettingLimits.activityCompactWidth.min),
      layoutSettingLimits.activityCompactWidth.max,
    )
  }

  function resetActivityRailWidth() {
    if (layoutSettings.value.activityRailMode === 'expanded') {
      layoutSettings.value.activityExpandedWidth = defaultLayoutSettings.activityExpandedWidth
      return
    }

    layoutSettings.value.activityCompactWidth = defaultLayoutSettings.activityCompactWidth
  }

  function setSplitRatio(ratio: number) {
    layoutSettings.value.splitRatio = Math.min(
      Math.max(ratio, layoutSettingLimits.splitRatio.min),
      layoutSettingLimits.splitRatio.max,
    )
  }

  function toggleFocusMode() {
    layoutSettings.value.focusMode = !layoutSettings.value.focusMode
  }

  function runActiveVisualCommand(command: VisualEditorCommand) {
    activeEditorAdapter.value?.runVisualCommand?.(command)
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
    }, 'Could not open dropped item')
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
      setWatcherWarning(`Diagnostics exported to ${cleanDisplayPath(exportedPath)}`)
    }, 'Could not export diagnostics')
  }
  const openLogsFolder = nativePorts.diagnostics.openLogsFolder
  const restoreWorkspaceByPath = nativePorts.workspace.restoreWorkspaceByPath

  const commandController = createApplicationCommandController({
    hasNativeRuntime: hasNativeRuntimeOnStartup,
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
  const {
    canExecuteCommand,
    executeCommand,
    handleGlobalKeydown,
  } = commandController

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
  const {
    mount: mountApplicationLifecycle,
    dispose: disposeApplicationLifecycle,
  } = applicationLifecycleController

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
    layoutSettings,
    (settings) => {
      saveLayoutSettings(settings)
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
    mountApplicationLifecycle(initialText)
    window.addEventListener('blur', triggerAutosaveOnWindowBlur)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('blur', triggerAutosaveOnWindowBlur)
    disposeApplicationLifecycle()
  })

  return {
    activeDocument,
    activeDocumentMode,
    activeDocumentWordCount,
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
    runActiveVisualCommand,
    setActivitySection,
    setActivityRailMode,
    setActivityRailWidth,
    resetActivityRailWidth,
    setSidebarWidth,
    setSplitRatio,
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
