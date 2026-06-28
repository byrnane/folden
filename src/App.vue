<script setup lang="ts">
import {
  Columns2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  PanelRightOpen,
  Save,
  X,
} from 'lucide-vue-next'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import MarkdownSafetyDialog from './components/MarkdownSafetyDialog.vue'
import PromptDialog from './components/PromptDialog.vue'
import RecoveryDialog from './components/RecoveryDialog.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import {
  analyzeMarkdownSafety,
  type MarkdownSafetyReport,
  type MarkdownUnsupportedFeature,
} from './markdownSafety'
import { shouldPromptToDiscardDocument } from './closeProtection'
import SourceEditor from './SourceEditor.vue'
import {
  closeNativeDocuments,
  createDirectory,
  createFile,
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
  type OpenedDocument,
  type WorkspaceDescriptor,
  type WorkspaceEntry,
} from './tauriFiles'
import {
  createDocumentState,
  type EditorMode,
  type OpenDocument,
} from './documentState'
import { createTextFileFormat, isDocumentDirty } from './domain/document'
import {
  acceptDocumentUpdate,
  createEditorViewSession,
  getSynchronizedSessionIds,
  type DocumentUpdate,
  type EditorViewSession,
} from './editorSync'
import { createDocumentSaveQueue } from './saveQueue'
import {
  buildSessionDocumentKey,
  loadRecoverySnapshots,
  loadSessionState,
  MAX_RECOVERY_ENTRIES,
  openTextFileAtPath,
  pruneRecoverySnapshots,
  saveRecoverySnapshots,
  saveSessionState,
  type PersistedSessionState,
  type RecoverySnapshot,
  type SessionDocumentKind,
  type SessionPaneId,
} from './sessionRecovery'
import VisualMarkdownEditor from './VisualMarkdownEditor.vue'
import WorkspaceTree from './WorkspaceTree.vue'

type Workspace = {
  id: string
  rootPath: string
  name: string
  entries: WorkspaceEntry[]
}

type EditorPane = {
  id: 'left' | 'right'
  title: string
  documentIds: string[]
  activeDocumentId: string | null
}

type EditorAdapter = {
  flushContent: () => string
}

type PromptDialogState = {
  title: string
  message: string
  initialValue: string
  placeholder: string
  confirmLabel: string
  inputLabel: string
  validate?: (value: string) => string | null
  normalize?: (value: string) => string
  resolve: (value: string | null) => void
}

type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  confirmTone: 'default' | 'danger'
  resolve: (confirmed: boolean) => void
}

type UnsavedDialogDecision = 'save' | 'discard' | 'cancel'

type UnsavedDialogState = {
  title: string
  message: string
  saveLabel: string
  discardLabel: string
  cancelLabel: string
  showSave: boolean
  resolve: (decision: UnsavedDialogDecision) => void
}

type RecoveryDialogDecision = 'restore' | 'open-copy' | 'discard' | 'later'

type RecoveryDialogState = {
  title: string
  message: string
  details: string | null
  resolve: (decision: RecoveryDialogDecision) => void
}

type WindowCloseDecision = 'clean' | 'save' | 'discard' | 'cancel'

type MarkdownSafetyDialogState = {
  title: string
  features: MarkdownUnsupportedFeature[]
  resolve: (confirmed: boolean) => void
}

const initialText = '# Untitled\n\nStart writing in Folden.\n'
const recentWorkspaceStorageKey = 'folden:recent-workspaces'
const documentState = createDocumentState({
  fileNameFromPath,
  isMarkdownPath,
  normalizePath,
})
const {
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
  markDocumentMissing,
  clearDocumentExternalState,
  updateDocumentPaths,
  removeDocuments,
} = documentState
const initialDocument = createDocumentDraft(initialText, 'Untitled.md')

const workspace = ref<Workspace | null>(null)
const expandedWorkspacePaths = ref(new Set<string>())
const loadedWorkspacePaths = ref(new Set<string>())
const loadingWorkspacePaths = ref(new Set<string>())
const workspaceLoadErrors = ref<Record<string, string>>({})
const selectedPath = ref<string | null>(null)
const panes = ref<EditorPane[]>([
  {
    id: 'left',
    title: 'Main',
    documentIds: [initialDocument.id],
    activeDocumentId: initialDocument.id,
  },
  {
    id: 'right',
    title: 'Split',
    documentIds: [],
    activeDocumentId: null,
  },
])
const activePaneId = ref<EditorPane['id']>('left')
const splitEnabled = ref(false)
const errorMessage = ref<string | null>(null)
const watcherWarning = ref<string | null>(null)
const isFileBusy = ref(false)
const recentWorkspaces = ref(loadRecentWorkspaces())
const paneDocumentModes = ref<Record<string, EditorMode>>({})
const viewSessions = ref<Record<string, EditorViewSession>>({})
const paneEditors = ref<Partial<Record<EditorPane['id'], EditorAdapter | null>>>({})
const promptDialog = ref<PromptDialogState | null>(null)
const promptDialogError = ref<string | null>(null)
const confirmDialog = ref<ConfirmDialogState | null>(null)
const unsavedDialog = ref<UnsavedDialogState | null>(null)
const markdownSafetyDialog = ref<MarkdownSafetyDialogState | null>(null)
const recoveryDialog = ref<RecoveryDialogState | null>(null)
const pendingRecoveryEntries = ref<RecoverySnapshot[]>([])
let tauriWindowCloseUnlisten: (() => void) | null = null
let fsEventUnlisten: (() => void) | null = null
let watcherWarningUnlisten: (() => void) | null = null
let sessionRestoreComplete = false
let sessionPersistTimeout: number | null = null
let sessionPersistRunning = false
let sessionPersistRequested = false
const markdownSafetyCache = ref<Record<string, MarkdownSafetyReport>>({})
const visualSafetyAcknowledgments = ref<Record<string, number>>({})
const pendingWorkspaceRefreshes = new Map<string, number>()
const pendingDocumentReloads = new Map<string, number>()
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
      selectedPath.value = nextDocument.relativePath
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
  },
})
viewSessions.value = {
  [paneDocumentModeKey('left', initialDocument.id)]: createEditorViewSession(
    initialDocument,
    'left',
    initialDocument.defaultMode,
  ),
}

const activePane = computed(() => getPane(activePaneId.value) ?? panes.value[0])
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
const visiblePanes = computed(() =>
  splitEnabled.value ? panes.value : panes.value.filter((pane) => pane.id === 'left'),
)
const selectedDirectoryPath = computed(() => {
  if (!workspace.value) {
    return null
  }

  if (!selectedPath.value) {
    return ''
  }

  const entry = findEntry(workspace.value.entries, selectedPath.value)

  if (!entry) {
    return ''
  }

  if (entry.kind === 'directory') {
    return entry.path
  }

  return parentPath(entry.path) ?? ''
})

function buildPersistedSessionState(): PersistedSessionState {
  const documentRecords: PersistedSessionState['documents'] = documents.value.map((document) => ({
    key: buildSessionDocumentKey(document, normalizePath),
    kind: sessionDocumentKind(document),
    path: document.path,
    workspaceRootPath: documentWorkspaceRootPath(document),
    relativePath: document.relativePath,
    name: document.name,
  }))
  const paneModeEntries = Object.entries(paneDocumentModes.value)
    .map(([key, mode]) => {
      const [paneId, documentId] = key.split(':', 2) as [SessionPaneId, string]
      const document = getDocument(documentId)

      if (!document) {
        return null
      }

      return {
        paneId,
        documentKey: buildSessionDocumentKey(document, normalizePath),
        mode,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return {
    workspaceRootPath: workspace.value?.rootPath ?? null,
    splitEnabled: splitEnabled.value,
    activePaneId: activePaneId.value,
    panes: panes.value.map((pane) => ({
      id: pane.id,
      documentKeys: pane.documentIds
        .map((documentId) => getDocument(documentId))
        .filter((document): document is OpenDocument => document !== null)
        .map((document) => buildSessionDocumentKey(document, normalizePath)),
      activeDocumentKey: pane.activeDocumentId
        ? (() => {
          const activeDocumentRecord = getDocument(pane.activeDocumentId)
          return activeDocumentRecord
            ? buildSessionDocumentKey(activeDocumentRecord, normalizePath)
            : null
        })()
        : null,
    })),
    documents: documentRecords,
    paneModes: paneModeEntries,
  }
}

function buildCurrentRecoverySnapshots() {
  return documents.value
    .filter((document) => isDirty(document))
    .map((document) => ({
      key: buildSessionDocumentKey(document, normalizePath),
      kind: sessionDocumentKind(document),
      path: document.path,
      workspaceRootPath: documentWorkspaceRootPath(document),
      relativePath: document.relativePath,
      name: document.name,
      content: document.content,
      fileFormat: document.fileFormat,
      fingerprint: document.diskFingerprint,
      updatedAtMs: Date.now(),
    } satisfies RecoverySnapshot))
}

function buildPersistedRecoverySnapshots(excludedKeys = new Set<string>()) {
  const currentEntries = buildCurrentRecoverySnapshots()
    .filter((entry) => !excludedKeys.has(entry.key))
  const currentKeys = new Set(currentEntries.map((entry) => entry.key))
  const mergedEntries = [
    ...pendingRecoveryEntries.value.filter((entry) => (
      !excludedKeys.has(entry.key) && !currentKeys.has(entry.key)
    )),
    ...currentEntries,
  ]

  return pruneRecoverySnapshots(mergedEntries, MAX_RECOVERY_ENTRIES)
}

async function persistSessionAndRecoveryState() {
  if (!sessionRestoreComplete) {
    return
  }

  if (sessionPersistRunning) {
    sessionPersistRequested = true
    return
  }

  sessionPersistRunning = true

  try {
    await saveSessionState(buildPersistedSessionState())
    await saveRecoverySnapshots(buildPersistedRecoverySnapshots())
  } catch (error) {
    errorMessage.value = `Could not persist session data: ${formatError(error)}`
  } finally {
    sessionPersistRunning = false

    if (sessionPersistRequested) {
      sessionPersistRequested = false
      void persistSessionAndRecoveryState()
    }
  }
}

function scheduleSessionPersistence() {
  if (!sessionRestoreComplete) {
    return
  }

  if (sessionPersistTimeout !== null) {
    window.clearTimeout(sessionPersistTimeout)
  }

  sessionPersistTimeout = window.setTimeout(() => {
    sessionPersistTimeout = null
    void persistSessionAndRecoveryState()
  }, 250)
}

function ensureViewSession(pane: EditorPane, document: OpenDocument) {
  const mode = getDocumentMode(pane, document)
  const sessionId = paneDocumentModeKey(pane.id, document.id)
  const existingSession = viewSessions.value[sessionId]

  if (existingSession) {
    existingSession.mode = mode
    existingSession.lastAppliedRevision = document.revision
    return existingSession
  }

  const session = createEditorViewSession(document, pane.id, mode)
  viewSessions.value = {
    ...viewSessions.value,
    [sessionId]: session,
  }

  return session
}

function getViewSessionId(pane: EditorPane, document: OpenDocument) {
  return viewSessions.value[paneDocumentModeKey(pane.id, document.id)]?.id
    ?? paneDocumentModeKey(pane.id, document.id)
}

function fileNameFromPath(path: string) {
  return cleanDisplayPath(path).split(/[\\/]/).at(-1) || path
}

function workspaceNameFromPath(path: string) {
  return fileNameFromPath(path) || path
}

function parentPath(path: string) {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))

  if (index <= 0) {
    return null
  }

  return path.slice(0, index)
}

function isMarkdownPath(path: string | null) {
  if (!path) {
    return true
  }

  return /\.(md|markdown)$/i.test(path)
}

function cleanDisplayPath(path: string) {
  if (path.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${path.slice('\\\\?\\UNC\\'.length)}`
  }

  if (path.startsWith('\\\\?\\')) {
    return path.slice('\\\\?\\'.length)
  }

  return path
}

function normalizePath(path: string) {
  return cleanDisplayPath(path).replaceAll('/', '\\').toLowerCase()
}

function joinWorkspacePath(rootPath: string, relativePath: string | null) {
  if (!relativePath) {
    return rootPath
  }

  return `${rootPath.replace(/[\\/]+$/u, '')}\\${relativePath.replace(/^[\\/]+/u, '')}`
}

function recoveredCopyName(name: string) {
  const match = name.match(/^(.*?)(\.[^.]*)?$/)
  const stem = match?.[1] || name
  const extension = match?.[2] || ''
  return `${stem} (Recovered)${extension}`
}

function documentWorkspaceRootPath(document: OpenDocument) {
  if (document.workspaceId && workspace.value?.id === document.workspaceId) {
    return workspace.value.rootPath
  }

  return null
}

function sessionDocumentKind(document: Pick<OpenDocument, 'path'>): SessionDocumentKind {
  return document.path ? 'saved' : 'scratch'
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
  const nextModes = { ...paneDocumentModes.value }

  for (const pane of panes.value) {
    if (!pane.documentIds.includes(document.id)) {
      continue
    }

    nextModes[paneDocumentModeKey(pane.id, document.id)] = 'source'
  }

  paneDocumentModes.value = nextModes
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

function getPane(id: EditorPane['id']) {
  return panes.value.find((pane) => pane.id === id) ?? null
}

function isDirty(document: OpenDocument) {
  return isDocumentDirty(document)
}

function loadRecentWorkspaces() {
  const rawValue = window.localStorage.getItem(recentWorkspaceStorageKey)

  if (!rawValue) {
    return []
  }

  try {
    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

function saveRecentWorkspaces(paths: string[]) {
  recentWorkspaces.value = [...new Set(paths)].slice(0, 6)
  window.localStorage.setItem(recentWorkspaceStorageKey, JSON.stringify(recentWorkspaces.value))
}

function clonePathSet(source: Set<string>) {
  return new Set(source)
}

function setWorkspacePathLoaded(path: string, loaded: boolean) {
  const nextLoadedPaths = clonePathSet(loadedWorkspacePaths.value)

  if (loaded) {
    nextLoadedPaths.add(path)
  } else {
    nextLoadedPaths.delete(path)
  }

  loadedWorkspacePaths.value = nextLoadedPaths
}

function setWorkspacePathLoading(path: string, loading: boolean) {
  const nextLoadingPaths = clonePathSet(loadingWorkspacePaths.value)

  if (loading) {
    nextLoadingPaths.add(path)
  } else {
    nextLoadingPaths.delete(path)
  }

  loadingWorkspacePaths.value = nextLoadingPaths
}

function setWorkspacePathExpanded(path: string, expanded: boolean) {
  const nextExpandedPaths = clonePathSet(expandedWorkspacePaths.value)

  if (expanded) {
    nextExpandedPaths.add(path)
  } else {
    nextExpandedPaths.delete(path)
  }

  expandedWorkspacePaths.value = nextExpandedPaths
}

function clearWorkspaceLoadError(path: string) {
  if (!(path in workspaceLoadErrors.value)) {
    return
  }

  const nextErrors = { ...workspaceLoadErrors.value }
  delete nextErrors[path]
  workspaceLoadErrors.value = nextErrors
}

function setWorkspaceLoadError(path: string, message: string) {
  workspaceLoadErrors.value = {
    ...workspaceLoadErrors.value,
    [path]: message,
  }
}

function removeWorkspacePathState(path: string) {
  const normalizedTargetPath = normalizePath(path)
  loadedWorkspacePaths.value = new Set(
    [...loadedWorkspacePaths.value].filter((value) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue !== normalizedTargetPath
        && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
    }),
  )
  loadingWorkspacePaths.value = new Set(
    [...loadingWorkspacePaths.value].filter((value) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue !== normalizedTargetPath
        && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
    }),
  )
  expandedWorkspacePaths.value = new Set(
    [...expandedWorkspacePaths.value].filter((value) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue !== normalizedTargetPath
        && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
    }),
  )
  workspaceLoadErrors.value = Object.fromEntries(
    Object.entries(workspaceLoadErrors.value).filter(([value]) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue !== normalizedTargetPath
        && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
    }),
  )
}

function remapWorkspacePathState(previousPath: string, nextPath: string) {
  const normalizedPreviousPath = normalizePath(previousPath)
  const remapPath = (value: string) => (
    normalizePath(value) === normalizedPreviousPath
      ? nextPath
      : `${nextPath}${value.slice(previousPath.length)}`
  )
  loadedWorkspacePaths.value = new Set(
    [...loadedWorkspacePaths.value].map((value) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue === normalizedPreviousPath
        || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
        ? remapPath(value)
        : value
    }),
  )
  loadingWorkspacePaths.value = new Set(
    [...loadingWorkspacePaths.value].map((value) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue === normalizedPreviousPath
        || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
        ? remapPath(value)
        : value
    }),
  )
  expandedWorkspacePaths.value = new Set(
    [...expandedWorkspacePaths.value].map((value) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue === normalizedPreviousPath
        || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
        ? remapPath(value)
        : value
    }),
  )
  workspaceLoadErrors.value = Object.fromEntries(
    Object.entries(workspaceLoadErrors.value).map(([value, message]) => {
      const normalizedValue = normalizePath(value)
      return normalizedValue === normalizedPreviousPath
        || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
        ? [remapPath(value), message]
        : [value, message]
    }),
  )
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

function openPromptDialog(options: Omit<PromptDialogState, 'resolve'>) {
  promptDialogError.value = null

  return new Promise<string | null>((resolve) => {
    promptDialog.value = {
      ...options,
      resolve,
    }
  })
}

function submitPromptDialog(value: string) {
  const currentDialog = promptDialog.value

  if (!currentDialog) {
    return
  }

  const validationError = currentDialog.validate?.(value) ?? null

  if (validationError) {
    promptDialogError.value = validationError
    return
  }

  promptDialogError.value = null
  promptDialog.value = null
  currentDialog.resolve(currentDialog.normalize ? currentDialog.normalize(value) : value)
}

function cancelPromptDialog() {
  const currentDialog = promptDialog.value
  promptDialogError.value = null
  promptDialog.value = null
  currentDialog?.resolve(null)
}

function openConfirmDialog(options: Omit<ConfirmDialogState, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    confirmDialog.value = {
      ...options,
      resolve,
    }
  })
}

function resolveConfirmDialog(confirmed: boolean) {
  const currentDialog = confirmDialog.value
  confirmDialog.value = null
  currentDialog?.resolve(confirmed)
}

function openMarkdownSafetyDialog(options: Omit<MarkdownSafetyDialogState, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    markdownSafetyDialog.value = {
      ...options,
      resolve,
    }
  })
}

function resolveMarkdownSafetyDialog(confirmed: boolean) {
  const currentDialog = markdownSafetyDialog.value
  markdownSafetyDialog.value = null
  currentDialog?.resolve(confirmed)
}

function openUnsavedDialog(options: Omit<UnsavedDialogState, 'resolve'>) {
  return new Promise<UnsavedDialogDecision>((resolve) => {
    unsavedDialog.value = {
      ...options,
      resolve,
    }
  })
}

function resolveUnsavedDialog(decision: UnsavedDialogDecision) {
  const currentDialog = unsavedDialog.value
  unsavedDialog.value = null
  currentDialog?.resolve(decision)
}

function openRecoveryDialog(options: Omit<RecoveryDialogState, 'resolve'>) {
  return new Promise<RecoveryDialogDecision>((resolve) => {
    recoveryDialog.value = {
      ...options,
      resolve,
    }
  })
}

function resolveRecoveryDialog(decision: RecoveryDialogDecision) {
  const currentDialog = recoveryDialog.value
  recoveryDialog.value = null
  currentDialog?.resolve(decision)
}

function findEntry(entries: WorkspaceEntry[], path: string): WorkspaceEntry | null {
  for (const entry of entries) {
    if (entry.path === path) {
      return entry
    }

    const child = findEntry(entry.children, path)

    if (child) {
      return child
    }
  }

  return null
}

function setActivePane(paneId: EditorPane['id']) {
  activePaneId.value = paneId
}

function clearSidebarSelection() {
  selectedPath.value = null
}

function paneDocumentModeKey(paneId: EditorPane['id'], documentId: string) {
  return `${paneId}:${documentId}`
}

function getDocumentMode(pane: EditorPane, document: OpenDocument) {
  return paneDocumentModes.value[paneDocumentModeKey(pane.id, document.id)] ?? document.defaultMode
}

async function confirmVisualMode(document: OpenDocument) {
  if (!isMarkdownDocument(document)) {
    return false
  }

  const safetyReport = getMarkdownSafetyReport(document)

  if (safetyReport.unsupportedFeatures.some((feature) => feature.kind === 'remote-image')) {
    errorMessage.value = 'Documents with remote images must stay in Source mode in this release.'
    return false
  }

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

  ensureViewSession(pane, document)
  flushPaneEditorContent(pane.id)
  paneDocumentModes.value = {
    ...paneDocumentModes.value,
    [paneDocumentModeKey(pane.id, document.id)]: mode,
  }
}

function setActiveDocument(pane: EditorPane, documentId: string) {
  pane.activeDocumentId = documentId
  activePaneId.value = pane.id
}

function addDocumentToPane(document: OpenDocument, paneId = activePaneId.value) {
  const pane = getPane(paneId)

  if (!pane) {
    return
  }

  enforceDocumentVisualSafety(document)

  if (!pane.documentIds.includes(document.id)) {
    pane.documentIds.push(document.id)
  }

  ensureViewSession(pane, document)
  setActiveDocument(pane, document.id)
}

function setPaneEditorAdapter(paneId: EditorPane['id'], adapter: EditorAdapter | null) {
  paneEditors.value = {
    ...paneEditors.value,
    [paneId]: adapter,
  }
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

  const acceptedUpdate = acceptDocumentUpdate(document, update)

  if (!acceptedUpdate) {
    return
  }

  const nextDocument = applyDocumentUpdate(document.id, update.baseRevision, acceptedUpdate.nextContent)

  if (!nextDocument) {
    return
  }

  enforceDocumentVisualSafety(nextDocument)

  const sessions = Object.values(viewSessions.value)
  const sessionIds = [
    update.originViewId,
    ...getSynchronizedSessionIds(sessions, document.id, update.originViewId),
  ]
  const nextSessions = { ...viewSessions.value }

  for (const sessionId of sessionIds) {
    const session = nextSessions[sessionId]

    if (!session) {
      continue
    }

    nextSessions[sessionId] = {
      ...session,
      lastAppliedRevision: nextDocument.revision,
    }
  }

  viewSessions.value = nextSessions
}

function updateDocumentSessions(documentId: string, revision: number) {
  const nextSessions = { ...viewSessions.value }

  for (const [sessionId, session] of Object.entries(nextSessions)) {
    if (session.documentId !== documentId) {
      continue
    }

    nextSessions[sessionId] = {
      ...session,
      lastAppliedRevision: revision,
    }
  }

  viewSessions.value = nextSessions
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

function setSplitEnabled(enabled: boolean) {
  if (enabled) {
    splitEnabled.value = true
    return
  }

  mergeRightPaneIntoLeft()
  splitEnabled.value = false
  activePaneId.value = 'left'
}

function mergeRightPaneIntoLeft() {
  const leftPane = getPane('left')
  const rightPane = getPane('right')
  const nextPaneDocumentModes = { ...paneDocumentModes.value }

  if (!leftPane || !rightPane) {
    return
  }

  for (const documentId of rightPane.documentIds) {
    if (!leftPane.documentIds.includes(documentId)) {
      leftPane.documentIds.push(documentId)
    }

    const rightMode = paneDocumentModes.value[paneDocumentModeKey('right', documentId)]

    if (rightMode) {
      nextPaneDocumentModes[paneDocumentModeKey('left', documentId)] = rightMode
    }

    delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
  }

  if (rightPane.activeDocumentId) {
    leftPane.activeDocumentId = rightPane.activeDocumentId
  } else if (!leftPane.activeDocumentId) {
    leftPane.activeDocumentId = leftPane.documentIds.at(-1) ?? null
  }

  rightPane.documentIds = []
  rightPane.activeDocumentId = null
  paneDocumentModes.value = nextPaneDocumentModes
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

    await loadWorkspace(descriptor)
  }, 'Could not open workspace')
}

async function loadWorkspace(descriptor: WorkspaceDescriptor) {
  const entries = await listDirectory(descriptor.id, '')
  workspace.value = {
    id: descriptor.id,
    rootPath: descriptor.rootPath,
    name: descriptor.name,
    entries,
  }
  expandedWorkspacePaths.value = new Set()
  loadedWorkspacePaths.value = new Set([''])
  loadingWorkspacePaths.value = new Set()
  workspaceLoadErrors.value = {}
  selectedPath.value = null
  saveRecentWorkspaces([descriptor.rootPath, ...recentWorkspaces.value])
}

async function refreshWorkspace() {
  await refreshWorkspaceBranch('')
}

function replaceWorkspaceBranch(
  entries: WorkspaceEntry[],
  branchPath: string,
  nextChildren: WorkspaceEntry[],
): WorkspaceEntry[] {
  if (!branchPath) {
    return nextChildren
  }

  return entries.map((entry) => {
    if (entry.path === branchPath && entry.kind === 'directory') {
      return {
        ...entry,
        children: nextChildren,
      }
    }

    if (entry.kind !== 'directory' || entry.children.length === 0) {
      return entry
    }

    return {
      ...entry,
      children: replaceWorkspaceBranch(entry.children, branchPath, nextChildren),
    }
  })
}

async function refreshWorkspaceBranch(branchPath: string | null, preserveDescendants = true) {
  if (!workspace.value) {
    return
  }

  const normalizedBranchPath = branchPath ?? ''
  clearWorkspaceLoadError(normalizedBranchPath)
  const nextChildren = await listDirectory(workspace.value.id, normalizedBranchPath)

  if (normalizedBranchPath === '') {
    workspace.value.entries = nextChildren
    setWorkspacePathLoaded('', true)
    return
  }

  workspace.value.entries = replaceWorkspaceBranch(
    workspace.value.entries,
    normalizedBranchPath,
    nextChildren,
  )
  setWorkspacePathLoaded(normalizedBranchPath, true)

  if (!preserveDescendants) {
    return
  }

  const descendantPaths = [...loadedWorkspacePaths.value]
    .filter((value) => value !== normalizedBranchPath && value !== '')
    .filter((value) => (
      normalizedBranchPath === ''
        ? true
        : isSameOrChildPath(value, normalizedBranchPath)
    ))
    .sort((left, right) => left.split('\\').length - right.split('\\').length)

  for (const descendantPath of descendantPaths) {
    await refreshWorkspaceBranch(descendantPath, false)
  }
}

async function ensureWorkspaceBranchLoaded(branchPath: string) {
  if (!workspace.value) {
    return
  }

  if (loadedWorkspacePaths.value.has(branchPath) || loadingWorkspacePaths.value.has(branchPath)) {
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

function nearestLoadedWorkspaceBranch(branchPath: string | null) {
  let currentPath = branchPath ?? ''

  while (currentPath) {
    if (loadedWorkspacePaths.value.has(currentPath)) {
      return currentPath
    }

    currentPath = parentPath(currentPath) ?? ''
  }

  return ''
}

async function toggleWorkspaceDirectory(entry: WorkspaceEntry) {
  if (expandedWorkspacePaths.value.has(entry.path)) {
    setWorkspacePathExpanded(entry.path, false)
    return
  }

  setWorkspacePathExpanded(entry.path, true)

  try {
    await ensureWorkspaceBranchLoaded(entry.path)
  } catch (error) {
    watcherWarning.value = `Could not load folder ${entry.name}: ${formatError(error)}`
  }
}

function scheduleWorkspaceRefresh(branchPath: string | null) {
  const key = nearestLoadedWorkspaceBranch(branchPath)
  const existingTimeout = pendingWorkspaceRefreshes.get(key)

  if (existingTimeout !== undefined) {
    window.clearTimeout(existingTimeout)
  }

  const timeoutId = window.setTimeout(() => {
    pendingWorkspaceRefreshes.delete(key)
    void refreshWorkspaceBranch(key).catch((error) => {
      watcherWarning.value = `Could not refresh workspace after external changes: ${formatError(error)}`
    })
  }, 180)

  pendingWorkspaceRefreshes.set(key, timeoutId)
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

async function openWorkspaceFile(entry: WorkspaceEntry, paneId = activePaneId.value) {
  if (!workspace.value || entry.kind !== 'file') {
    return
  }

  selectedPath.value = entry.path

  await runFileTask(async () => {
    const document = await openTextFileByPath(workspace.value!.id, entry.path)
    openLoadedDocument(document, paneId)
  }, 'Could not open workspace file')
}

async function openEntryInRight(entry: WorkspaceEntry) {
  setSplitEnabled(true)
  await openWorkspaceFile(entry, 'right')
}

function moveActiveDocumentToRight() {
  const document = activeDocument.value
  const sourcePane = activePane.value
  const targetPane = getPane('right')

  if (!document || !sourcePane || !targetPane || sourcePane.id === 'right') {
    setSplitEnabled(true)
    return
  }

  setSplitEnabled(true)
  addDocumentToPane(document, 'right')
  sourcePane.documentIds = sourcePane.documentIds.filter((documentId) => documentId !== document.id)
  sourcePane.activeDocumentId = sourcePane.documentIds.at(-1) ?? null
}

async function saveDocument(document = activeDocument.value) {
  if (!document) {
    return
  }

  if (document.externalState !== 'idle' && document.nativeId) {
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
      reason: 'manual',
    })
  }, 'Could not save file')
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

function suggestFileName(content: string) {
  return `${safeFileBaseName(readMarkdownTitle(content))}.md`
}

function readMarkdownTitle(content: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]
  const fallbackText = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return heading ?? fallbackText ?? 'Untitled'
}

function safeFileBaseName(source: string) {
  const cleanName = source
    .replace(/^[#>*\-\s]+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .replace(/[.\s]+$/g, '')

  return cleanName || 'Untitled'
}

function removeDocumentView(pane: EditorPane, documentId: string) {
  pane.documentIds = pane.documentIds.filter((id) => id !== documentId)
  const document = getDocument(documentId)
  const nextPaneDocumentModes = { ...paneDocumentModes.value }
  const nextViewSessions = { ...viewSessions.value }

  delete nextPaneDocumentModes[paneDocumentModeKey(pane.id, documentId)]
  delete nextViewSessions[paneDocumentModeKey(pane.id, documentId)]

  if (pane.activeDocumentId === documentId) {
    pane.activeDocumentId = pane.documentIds.at(-1) ?? null
  }

  if (!panes.value.some((openPane) => openPane.documentIds.includes(documentId))) {
    releaseClosedNativeDocuments([documentId])
    removeDocuments([documentId])
    delete nextPaneDocumentModes[paneDocumentModeKey('left', documentId)]
    delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
    delete nextViewSessions[paneDocumentModeKey('left', documentId)]
    delete nextViewSessions[paneDocumentModeKey('right', documentId)]
  }

  paneDocumentModes.value = nextPaneDocumentModes
  viewSessions.value = nextViewSessions
}

async function closeDocument(pane: EditorPane, documentId: string) {
  flushPaneEditorContent(pane.id)

  const document = getDocument(documentId)

  if (!document) {
    removeDocumentView(pane, documentId)
    return
  }

  if (!shouldPromptToDiscardDocument(panes.value, documentId, isDirty(document))) {
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

async function renameWorkspacePath(entry: WorkspaceEntry) {
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
    updateDocumentPaths(entry.path, nextPath)
    for (const document of documents.value) {
      if (document.workspaceId !== workspace.value?.id || !document.relativePath) {
        continue
      }

      if (!isSameOrChildPath(document.relativePath, entry.path)) {
        continue
      }

      document.path = joinWorkspacePath(workspace.value.rootPath, document.relativePath)
    }
    selectedPath.value = nextPath
    await refreshWorkspaceBranch(parentPath(nextPath) ?? '')
  }, 'Could not rename path')
}

async function trashWorkspacePath(entry: WorkspaceEntry) {
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
    selectedPath.value = null
    await refreshWorkspaceBranch(parentPath(entry.path) ?? '')
  }, 'Could not move path to trash')
}

function removeDocumentsFromPanes(documentIds: string[]) {
  const documentIdSet = new Set(documentIds)

  for (const pane of panes.value) {
    pane.documentIds = pane.documentIds.filter((documentId) => !documentIdSet.has(documentId))

    if (pane.activeDocumentId && documentIdSet.has(pane.activeDocumentId)) {
      pane.activeDocumentId = pane.documentIds.at(-1) ?? null
    }
  }

  const nextPaneDocumentModes = { ...paneDocumentModes.value }

  for (const documentId of documentIds) {
    delete nextPaneDocumentModes[paneDocumentModeKey('left', documentId)]
    delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
  }

  paneDocumentModes.value = nextPaneDocumentModes
  releaseClosedNativeDocuments(documentIds)
  removeDocuments(documentIds)
}

function clearRestoredLayout() {
  const currentDocumentIds = documents.value.map((document) => document.id)
  releaseClosedNativeDocuments(currentDocumentIds)
  removeDocuments(currentDocumentIds)
  panes.value = [
    {
      id: 'left',
      title: 'Main',
      documentIds: [],
      activeDocumentId: null,
    },
    {
      id: 'right',
      title: 'Split',
      documentIds: [],
      activeDocumentId: null,
    },
  ]
  activePaneId.value = 'left'
  splitEnabled.value = false
  selectedPath.value = null
  paneDocumentModes.value = {}
  viewSessions.value = {}
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
  panes.value[0].documentIds = [fallbackDocument.id]
  panes.value[0].activeDocumentId = fallbackDocument.id
  viewSessions.value = {
    [paneDocumentModeKey('left', fallbackDocument.id)]: createEditorViewSession(
      fallbackDocument,
      'left',
      fallbackDocument.defaultMode,
    ),
  }
}

async function restoreSessionSnapshot() {
  const diagnostics: string[] = []
  const [session, recoveryLoadResult] = await Promise.all([
    loadSessionState(),
    loadRecoverySnapshots(),
  ])
  pendingRecoveryEntries.value = recoveryLoadResult.entries

  if (recoveryLoadResult.diagnostics.length > 0) {
    diagnostics.push(...recoveryLoadResult.diagnostics)
  }

  if (!session) {
    await inspectRecoverySnapshots(new Map())
    sessionRestoreComplete = true
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

  for (const pane of panes.value) {
    pane.documentIds = []
    pane.activeDocumentId = null
  }

  for (const paneRecord of session.panes) {
    const pane = getPane(paneRecord.id)

    if (!pane) {
      continue
    }

    pane.documentIds = paneRecord.documentKeys
      .map((key) => documentIdByKey.get(key) ?? null)
      .filter((documentId): documentId is string => documentId !== null)
    pane.activeDocumentId = paneRecord.activeDocumentKey
      ? documentIdByKey.get(paneRecord.activeDocumentKey) ?? pane.documentIds.at(-1) ?? null
      : pane.documentIds.at(-1) ?? null
  }

  for (const documentId of documentIdByKey.values()) {
    if (!panes.value.some((pane) => pane.documentIds.includes(documentId))) {
      panes.value[0].documentIds.push(documentId)
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

  paneDocumentModes.value = nextPaneModes
  splitEnabled.value = session.splitEnabled && panes.value[1].documentIds.length > 0
  activePaneId.value = getPane(session.activePaneId)?.documentIds.length ? session.activePaneId : 'left'
  ensureSessionFallbackDocument()

  for (const pane of panes.value) {
    for (const documentId of pane.documentIds) {
      const document = getDocument(documentId)

      if (document) {
        ensureViewSession(pane, document)
      }
    }
  }

  if (diagnostics.length > 0) {
    errorMessage.value = diagnostics.join(' ')
  }

  await inspectRecoverySnapshots(documentIdByKey)
  sessionRestoreComplete = true
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
      pendingRecoveryEntries.value = pendingRecoveryEntries.value.filter((item) => item.key !== entry.key)
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

    pendingRecoveryEntries.value = pendingRecoveryEntries.value.filter((item) => item.key !== entry.key)

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
  if (!workspace.value) {
    return null
  }

  const normalizedRoot = normalizePath(workspace.value.rootPath)
  const normalizedPath = normalizePath(path)

  if (normalizedPath === normalizedRoot) {
    return ''
  }

  if (!normalizedPath.startsWith(`${normalizedRoot}\\`)) {
    return null
  }

  return cleanDisplayPath(path).slice(cleanDisplayPath(workspace.value.rootPath).length + 1)
}

async function reloadDocumentFromDisk(documentId: string) {
  const document = getDocument(documentId)

  if (!document?.path) {
    return
  }

  const loadedDocument = (
    workspace.value &&
    document.workspaceId === workspace.value.id &&
    document.relativePath
  )
    ? await openTextFileByPath(workspace.value.id, document.relativePath)
    : await openTextFileAtPath(document.path)

  const reloadedDocument = replaceDocumentFromDisk(documentId, loadedDocument)

  if (reloadedDocument) {
    enforceDocumentVisualSafety(reloadedDocument)
    updateDocumentSessions(reloadedDocument.id, reloadedDocument.revision)
  }
}

function scheduleDocumentReload(documentId: string) {
  const existingTimeout = pendingDocumentReloads.get(documentId)

  if (existingTimeout !== undefined) {
    window.clearTimeout(existingTimeout)
  }

  const timeoutId = window.setTimeout(() => {
    pendingDocumentReloads.delete(documentId)
    void reloadDocumentFromDisk(documentId).catch((error) => {
      const document = getDocument(documentId)

      if (document) {
        markDocumentConflict(documentId, `Could not reload external changes: ${formatError(error)}`)
      }
    })
  }, 180)

  pendingDocumentReloads.set(documentId, timeoutId)
}

function handleExternalFileEvent(event: NativeFsEvent) {
  const document = findDocumentByPath(event.path)
  const relativePath = workspaceRelativePathFromAbsolute(event.path)

  if (relativePath !== null) {
    const branchPath = event.kind === 'remove'
      ? parentPath(relativePath) ?? ''
      : parentPath(relativePath) ?? ''

    scheduleWorkspaceRefresh(branchPath)
  }

  if (!document) {
    return
  }

  if (event.kind === 'remove') {
    markDocumentMissing(document.id, `${document.name} was moved or deleted outside Folden.`)
    return
  }

  if (isDirty(document)) {
    markDocumentConflict(document.id, `${document.name} changed on disk while you have unsaved edits.`)
    return
  }

  clearDocumentExternalState(document.id)
  scheduleDocumentReload(document.id)
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

function handleGlobalKeydown(event: KeyboardEvent) {
  const hasModifier = event.ctrlKey || event.metaKey

  if (!hasModifier) {
    return
  }

  const code = event.code

  if (code === 'KeyS') {
    event.preventDefault()
    void saveDocument()
    return
  }

  if (code === 'KeyZ' && event.shiftKey) {
    event.preventDefault()
    runDocumentRedo()
    return
  }

  if (code === 'KeyZ') {
    event.preventDefault()
    runDocumentUndo()
    return
  }

  if (code === 'KeyY') {
    event.preventDefault()
    runDocumentRedo()
    return
  }

  if (code === 'KeyO' && event.shiftKey) {
    event.preventDefault()
    void openWorkspace()
    return
  }

  if (code === 'KeyO') {
    event.preventDefault()
    void openNativeDocument()
    return
  }

  if (code === 'KeyN') {
    event.preventDefault()
    createScratchDocument()
    return
  }

  if (code === 'Backslash') {
    event.preventDefault()
    setSplitEnabled(!splitEnabled.value)
    return
  }

  if (code === 'ArrowRight' && event.shiftKey) {
    event.preventDefault()
    moveActiveDocumentToRight()
  }
}

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

  if (!isTauriRuntime()) {
    sessionRestoreComplete = true
    return
  }

  void restoreSessionSnapshot().catch((error) => {
    sessionRestoreComplete = true
    errorMessage.value = `Could not restore the previous session: ${formatError(error)}`
  })

  void listen<NativeFsEvent>('folden://fs-event', (event) => {
    handleExternalFileEvent(event.payload)
  }).then((unlisten) => {
    fsEventUnlisten = unlisten
  })

  void listen<string | null>('folden://watcher-warning', (event) => {
    watcherWarning.value = event.payload
  }).then((unlisten) => {
    watcherWarningUnlisten = unlisten
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
        pendingRecoveryEntries.value = pendingRecoveryEntries.value.filter((entry) => !discardedKeys.has(entry.key))
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
      await getCurrentWindow().close()
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
  fsEventUnlisten?.()
  watcherWarningUnlisten?.()

  if (sessionPersistTimeout !== null) {
    window.clearTimeout(sessionPersistTimeout)
    sessionPersistTimeout = null
  }

  for (const timeoutId of pendingWorkspaceRefreshes.values()) {
    window.clearTimeout(timeoutId)
  }

  for (const timeoutId of pendingDocumentReloads.values()) {
    window.clearTimeout(timeoutId)
  }
})
</script>

<template>
  <main class="app-shell">
    <aside class="workspace-sidebar" aria-label="Workspace" @click.self="clearSidebarSelection">
      <div class="workspace-header">
        <div>
          <p class="app-kicker">Folden</p>
          <h1>{{ workspace?.name ?? 'No workspace' }}</h1>
        </div>
        <button
          type="button"
          class="icon-button"
          title="Open folder"
          :disabled="isFileBusy"
          @click="openWorkspace"
        >
          <FolderOpen :size="17" />
        </button>
      </div>

      <div class="workspace-actions">
        <button type="button" class="icon-button" title="New scratch document" @click="createScratchDocument">
          <FilePlus :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="New file"
          :disabled="!workspace"
          @click="createWorkspaceFile()"
        >
          <FilePlus :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="New folder"
          :disabled="!workspace"
          @click="createWorkspaceDirectory()"
        >
          <FolderPlus :size="16" />
        </button>
      </div>

      <div v-if="workspace" class="workspace-root" :title="workspace.rootPath">
        {{ workspace.rootPath }}
      </div>

      <div
        v-if="workspace"
        class="workspace-tree-shell"
        @click.self="clearSidebarSelection"
      >
        <WorkspaceTree
          :entries="workspace.entries"
          :active-path="activePath"
          :selected-path="selectedPath"
          :expanded-paths="expandedWorkspacePaths"
          :loading-paths="loadingWorkspacePaths"
          :load-errors="workspaceLoadErrors"
          @clear-selection="clearSidebarSelection"
          @open-file="openWorkspaceFile"
          @select-path="selectedPath = $event.path"
          @create-file="createWorkspaceFile($event.path)"
          @create-directory="createWorkspaceDirectory($event.path)"
          @rename-path="renameWorkspacePath"
          @trash-path="trashWorkspacePath"
          @toggle-directory="toggleWorkspaceDirectory"
        />
      </div>

      <section v-else class="empty-sidebar">
        <p>Open a folder to start a workspace.</p>
        <button type="button" :disabled="isFileBusy" @click="openWorkspace">Open Folder</button>

        <div v-if="recentWorkspaces.length" class="recent-workspaces">
          <p class="sidebar-label">Recent</p>
          <button
            v-for="path in recentWorkspaces"
            :key="path"
            type="button"
            class="recent-workspace"
            :title="path"
            @click="
              runFileTask(
                async () => loadWorkspace(await restoreWorkspaceByPath(path)),
                'Could not open recent workspace',
              )
            "
          >
            {{ workspaceNameFromPath(path) }}
          </button>
        </div>
      </section>
    </aside>

    <section class="workbench">
      <header class="topbar">
        <div class="topbar-title">
          <span class="document-title">{{ activeDocument?.name ?? 'No document' }}</span>
          <span v-if="dirtyDocuments.length" class="dirty-marker">
            {{ dirtyDocuments.length }} unsaved
          </span>
        </div>

        <div class="topbar-actions">
          <button type="button" title="Open file" :disabled="isFileBusy" @click="openNativeDocument">
            Open
          </button>
          <button type="button" title="Open logs folder" :disabled="!isTauriRuntime()" @click="openLogsFolder">
            Logs
          </button>
          <button
            type="button"
            class="icon-button"
            title="Save"
            :disabled="isFileBusy || !activeDocument || (activeDocument.externalState !== 'idle' && !!activeDocument.nativeId)"
            @click="saveDocument()"
          >
            <Save :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Toggle split view"
            :class="{ active: splitEnabled }"
            @click="setSplitEnabled(!splitEnabled)"
          >
            <Columns2 :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Move active tab right"
            :disabled="!activeDocument"
            @click="moveActiveDocumentToRight"
          >
            <PanelRightOpen :size="16" />
          </button>
        </div>
      </header>

      <p
        v-if="errorMessage || watcherWarning"
        :class="errorMessage ? 'error-message' : 'warning-message'"
      >
        {{ errorMessage ?? watcherWarning }}
      </p>
      <section
        v-if="activeDocument?.externalState === 'conflict'"
        class="document-warning"
      >
        <div>
          <strong>External changes detected.</strong>
          <span>{{ activeDocument.externalMessage }}</span>
        </div>
        <div class="document-warning-actions">
          <button type="button" @click="reloadDocumentFromDisk(activeDocument.id)">
            Reload from disk
          </button>
          <button type="button" @click="saveDocumentAsCopy(activeDocument)">
            Save As
          </button>
          <button type="button" @click="clearDocumentExternalState(activeDocument.id)">
            Later
          </button>
        </div>
      </section>
      <section
        v-else-if="activeDocument?.externalState === 'missing'"
        class="document-warning"
      >
        <div>
          <strong>File is missing on disk.</strong>
          <span>{{ activeDocument.externalMessage }}</span>
        </div>
        <div class="document-warning-actions">
          <button type="button" @click="saveDocumentAsCopy(activeDocument)">
            Save As
          </button>
          <button type="button" @click="reloadDocumentFromDisk(activeDocument.id)">
            Retry reload
          </button>
        </div>
      </section>

      <section class="pane-grid" :class="{ split: splitEnabled }">
        <section
          v-for="pane in visiblePanes"
          :key="pane.id"
          class="editor-pane"
          :class="{ active: activePaneId === pane.id }"
          @click="setActivePane(pane.id)"
        >
          <header class="pane-header">
            <span>{{ pane.title }}</span>
            <div class="pane-tabs">
              <button
                v-for="documentId in pane.documentIds"
                :key="documentId"
                type="button"
                class="tab-button"
                :class="{ active: pane.activeDocumentId === documentId }"
                @click.stop="setActiveDocument(pane, documentId)"
              >
                <span>{{ getDocument(documentId)?.name ?? 'Missing' }}</span>
                <span v-if="getDocument(documentId) && isDirty(getDocument(documentId)!)" class="tab-dot" />
                <X
                  class="tab-close"
                  :size="13"
                  @click.stop="closeDocument(pane, documentId)"
                />
              </button>
            </div>
          </header>

          <template v-if="pane.activeDocumentId && getDocument(pane.activeDocumentId)">
            <div class="mode-switch">
              <button
                type="button"
                :class="{ active: getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual' }"
                :disabled="!isMarkdownPath(getDocument(pane.activeDocumentId)?.path ?? null)"
                @click="setPaneDocumentMode(pane, getDocument(pane.activeDocumentId)!, 'visual')"
              >
                Visual
              </button>
              <button
                type="button"
                :class="{ active: getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'source' }"
                @click="setPaneDocumentMode(pane, getDocument(pane.activeDocumentId)!, 'source')"
              >
                Source
              </button>
              <button
                v-if="pane.id !== 'right' && workspace && getDocument(pane.activeDocumentId)?.relativePath"
                type="button"
                class="open-right-button"
                @click="
                  openEntryInRight({
                    name: getDocument(pane.activeDocumentId)!.name,
                    path: getDocument(pane.activeDocumentId)!.relativePath!,
                    kind: 'file',
                    children: [],
                  })
                "
              >
                Open Right
              </button>
            </div>

            <VisualMarkdownEditor
              v-if="getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual'"
              :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
              :document-id="getDocument(pane.activeDocumentId)!.id"
              :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
              :model-value="getDocument(pane.activeDocumentId)!.content"
              :revision="getDocument(pane.activeDocumentId)!.revision"
              @document-update="handleDocumentUpdate"
            />
            <section v-else class="source-editor-frame">
              <SourceEditor
                :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
                :document-id="getDocument(pane.activeDocumentId)!.id"
                :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
                :model-value="getDocument(pane.activeDocumentId)!.content"
                :revision="getDocument(pane.activeDocumentId)!.revision"
                @document-update="handleDocumentUpdate"
              />
            </section>
          </template>

          <div v-else class="empty-pane">
            <p>No open file in this pane.</p>
          </div>
        </section>
      </section>

      <footer class="statusbar">
        <span>{{ documents.length }} open</span>
        <span class="path-status" :title="activeDocument?.path ? cleanDisplayPath(activeDocument.path) : 'Scratch document'">
          {{ activeLocation }}
        </span>
        <span>{{ activeDocument ? `${activeDocument.content.length} chars` : 'No document' }}</span>
      </footer>
    </section>
  </main>

  <PromptDialog
    :open="!!promptDialog"
    :title="promptDialog?.title ?? ''"
    :message="promptDialog?.message ?? ''"
    :initial-value="promptDialog?.initialValue ?? ''"
    :placeholder="promptDialog?.placeholder ?? ''"
    :confirm-label="promptDialog?.confirmLabel ?? 'Save'"
    :input-label="promptDialog?.inputLabel ?? 'Value'"
    :error="promptDialogError"
    @submit="submitPromptDialog"
    @cancel="cancelPromptDialog"
  />

  <ConfirmDialog
    :open="!!confirmDialog"
    :title="confirmDialog?.title ?? ''"
    :message="confirmDialog?.message ?? ''"
    :confirm-label="confirmDialog?.confirmLabel ?? 'Confirm'"
    :cancel-label="confirmDialog?.cancelLabel ?? 'Cancel'"
    :confirm-tone="confirmDialog?.confirmTone ?? 'default'"
    @confirm="resolveConfirmDialog(true)"
    @cancel="resolveConfirmDialog(false)"
  />

  <MarkdownSafetyDialog
    :open="!!markdownSafetyDialog"
    :title="markdownSafetyDialog?.title ?? ''"
    :features="markdownSafetyDialog?.features ?? []"
    @confirm="resolveMarkdownSafetyDialog(true)"
    @cancel="resolveMarkdownSafetyDialog(false)"
  />

  <UnsavedChangesDialog
    :open="!!unsavedDialog"
    :title="unsavedDialog?.title ?? ''"
    :message="unsavedDialog?.message ?? ''"
    :save-label="unsavedDialog?.saveLabel ?? 'Save'"
    :discard-label="unsavedDialog?.discardLabel ?? 'Discard'"
    :cancel-label="unsavedDialog?.cancelLabel ?? 'Cancel'"
    :show-save="unsavedDialog?.showSave ?? true"
    @save="resolveUnsavedDialog('save')"
    @discard="resolveUnsavedDialog('discard')"
    @cancel="resolveUnsavedDialog('cancel')"
  />

  <RecoveryDialog
    :open="!!recoveryDialog"
    :title="recoveryDialog?.title ?? ''"
    :message="recoveryDialog?.message ?? ''"
    :details="recoveryDialog?.details ?? null"
    @restore="resolveRecoveryDialog('restore')"
    @open-copy="resolveRecoveryDialog('open-copy')"
    @discard="resolveRecoveryDialog('discard')"
    @later="resolveRecoveryDialog('later')"
  />
</template>
