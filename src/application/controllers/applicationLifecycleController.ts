import type { Ref } from 'vue'
import type { OpenDocument, EditorMode } from '../../domain/documents/documentState'
import type {
  NativeFsEvent,
  OpenedDocument,
  WorkspaceDescriptor,
} from '../../domain/native'
import {
  buildSessionDocumentKey,
  type PersistedSessionState,
  type RecoverySnapshot,
} from '../sessionRecovery'
import { formatError } from '../helpers/errorHelpers'
import {
  normalizePath,
  recoveredCopyName,
} from '../helpers/pathHelpers'
import type {
  DocumentFilePort,
  NativeEventPort,
  SessionStoragePort,
  WorkspaceFilePort,
} from '../ports/nativePorts'
import type { EditorPane, WindowCloseDecision } from '../types/shell'

type WindowLike = {
  addEventListener: (
    type: 'keydown' | 'beforeunload',
    listener: ((event: KeyboardEvent) => void) | ((event: BeforeUnloadEvent) => void),
  ) => void
  removeEventListener: (
    type: 'keydown' | 'beforeunload',
    listener: ((event: KeyboardEvent) => void) | ((event: BeforeUnloadEvent) => void),
  ) => void
}

type ReadonlyValue<T> = {
  readonly value: T
}

type LifecycleDeps = {
  documentFiles: DocumentFilePort
  workspaceFiles: WorkspaceFilePort
  sessionStorage: SessionStoragePort
  nativeEvents: NativeEventPort
  hasNativeRuntime: boolean
  windowTarget: WindowLike
  errorMessage: Ref<string | null>
  workspace: ReadonlyValue<{ id: string, rootPath: string } | null>
  documents: ReadonlyValue<OpenDocument[]>
  dirtyDocuments: ReadonlyValue<OpenDocument[]>
  paneDocumentModes: ReadonlyValue<Record<string, EditorMode>>
  splitEnabled: ReadonlyValue<boolean>
  activePaneId: ReadonlyValue<EditorPane['id']>
  pendingRecoveryEntries: ReadonlyValue<readonly RecoverySnapshot[]>
  handleGlobalKeydown: (event: KeyboardEvent) => void
  handleExternalFileEvent: (event: NativeFsEvent) => void
  setWatcherWarning: (message: string | null) => void
  loadWorkspace: (descriptor: WorkspaceDescriptor) => Promise<void>
  clearRestoredLayout: () => void
  addDocumentToPane: (document: OpenDocument, paneId?: EditorPane['id']) => void
  createDocumentDraft: (content: string, fallbackName?: string) => OpenDocument
  openDocumentState: (document: OpenedDocument) => OpenDocument
  getDocument: (documentId: string) => OpenDocument | null
  applyDocumentUpdate: (documentId: string, baseRevision: number, nextContent: string) => OpenDocument | null
  enforceDocumentVisualSafety: (document: OpenDocument) => void
  setFallbackDocument: (document: OpenDocument) => void
  restoreLayout: (
    panes: Array<Pick<EditorPane, 'id' | 'documentIds' | 'activeDocumentId'>>,
    paneModes: Record<string, EditorMode>,
    splitEnabled: boolean,
    activePaneId: EditorPane['id'],
    getDocument: (documentId: string) => OpenDocument | null,
  ) => Set<string>
  getPaneSnapshot: () => EditorPane[]
  paneDocumentModeKey: (paneId: EditorPane['id'], documentId: string) => string
  isDirty: (document: OpenDocument) => boolean
  saveDirtyDocuments: (documentIds: string[]) => Promise<boolean>
  markRestoreComplete: () => void
  setPendingRecoveryEntries: (entries: RecoverySnapshot[]) => void
  removePendingRecoveryEntry: (key: string) => void
  discardPendingRecoveryEntries: (keys: Set<string>) => void
  buildPersistedSessionState: () => PersistedSessionState
  buildPersistedRecoverySnapshots: (excludedKeys?: Set<string>) => RecoverySnapshot[]
  persistSessionAndRecoveryState: () => Promise<void>
  scheduleSessionPersistence: () => void
  disposeSessionController: () => void
  disposeExternalChangesController: () => void
  disposeDocumentWorkflowController: () => void
  openRecoveryDialog: (options: {
    title: string
    message: string
    details: string | null
  }) => Promise<'restore' | 'open-copy' | 'discard' | 'later'>
  openUnsavedDialog: (options: {
    title: string
    message: string
    saveLabel: string
    discardLabel: string
    cancelLabel: string
    showSave: boolean
  }) => Promise<'save' | 'discard' | 'cancel'>
}

export function createApplicationLifecycleController(deps: LifecycleDeps) {
  let fsEventUnlisten: (() => void) | null = null
  let watcherWarningUnlisten: (() => void) | null = null
  let tauriWindowCloseUnlisten: (() => void) | null = null
  let isProgrammaticWindowClose = false
  let disposed = false
  let subscriptionEpoch = 0

  function buildPersistedSessionState() {
    return deps.buildPersistedSessionState()
  }

  function buildPersistedRecoverySnapshots(excludedKeys = new Set<string>()) {
    return deps.buildPersistedRecoverySnapshots(excludedKeys)
  }

  async function writeSessionAndRecoveryState() {
    try {
      await deps.sessionStorage.saveSessionState(buildPersistedSessionState())
      await deps.sessionStorage.saveRecoverySnapshots(buildPersistedRecoverySnapshots())
    } catch (error) {
      deps.errorMessage.value = `Could not persist session data: ${formatError(error)}`
    }
  }

  async function persistSessionAndRecoveryState() {
    await deps.persistSessionAndRecoveryState()
  }

  function scheduleSessionPersistence() {
    deps.scheduleSessionPersistence()
  }

  async function restoreDocumentFromSession(record: PersistedSessionState['documents'][number]) {
    if (record.kind === 'scratch') {
      return deps.createDocumentDraft('', record.name)
    }

    if (
      deps.workspace.value &&
      record.workspaceRootPath &&
      normalizePath(deps.workspace.value.rootPath) === normalizePath(record.workspaceRootPath) &&
      record.relativePath
    ) {
      return deps.openDocumentState(await deps.documentFiles.openTextFileByPath(deps.workspace.value.id, record.relativePath))
    }

    if (!record.path) {
      return null
    }

    return deps.openDocumentState(await deps.documentFiles.openTextFileAtPath(record.path))
  }

  function ensureSessionFallbackDocument(initialText: string) {
    if (deps.documents.value.length > 0) {
      return
    }

    const fallbackDocument = deps.createDocumentDraft(initialText, 'Untitled.md')
    deps.setFallbackDocument(fallbackDocument)
  }

  async function restoreSessionSnapshot(initialText: string) {
    const diagnostics: string[] = []
    const [session, recoveryLoadResult] = await Promise.all([
      deps.sessionStorage.loadSessionState(),
      deps.sessionStorage.loadRecoverySnapshots(),
    ])
    deps.setPendingRecoveryEntries(recoveryLoadResult.entries)

    if (recoveryLoadResult.diagnostics.length > 0) {
      diagnostics.push(...recoveryLoadResult.diagnostics)
    }

    if (!session) {
      await inspectRecoverySnapshots(new Map())
      deps.markRestoreComplete()
      await persistSessionAndRecoveryState()
      if (diagnostics.length > 0) {
        deps.errorMessage.value = diagnostics.join(' ')
      }
      return
    }

    deps.clearRestoredLayout()

    if (session.workspaceRootPath) {
      try {
        await deps.loadWorkspace(await deps.workspaceFiles.restoreWorkspaceByPath(session.workspaceRootPath))
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

      nextPaneModes[deps.paneDocumentModeKey(modeRecord.paneId, documentId)] = modeRecord.mode
    }

    const restoredDocumentIds = deps.restoreLayout(
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
      deps.getDocument,
    )

    for (const documentId of documentIdByKey.values()) {
      if (!restoredDocumentIds.has(documentId)) {
        const document = deps.getDocument(documentId)

        if (document) {
          deps.addDocumentToPane(document, 'left')
        }
      }
    }

    ensureSessionFallbackDocument(initialText)

    if (diagnostics.length > 0) {
      deps.errorMessage.value = diagnostics.join(' ')
    }

    await inspectRecoverySnapshots(documentIdByKey)
    deps.markRestoreComplete()
    await persistSessionAndRecoveryState()
  }

  async function ensureRecoveryDocument(entry: RecoverySnapshot, documentIdByKey: Map<string, string>) {
    const knownDocumentId = documentIdByKey.get(entry.key)

    if (knownDocumentId) {
      return deps.getDocument(knownDocumentId)
    }

    if (entry.kind === 'scratch') {
      const scratchDocument = deps.createDocumentDraft('', entry.name)
      deps.addDocumentToPane(scratchDocument, 'left')
      documentIdByKey.set(entry.key, scratchDocument.id)
      return scratchDocument
    }

    if (
      deps.workspace.value &&
      entry.workspaceRootPath &&
      normalizePath(deps.workspace.value.rootPath) === normalizePath(entry.workspaceRootPath) &&
      entry.relativePath
    ) {
      const document = deps.openDocumentState(await deps.documentFiles.openTextFileByPath(deps.workspace.value.id, entry.relativePath))
      deps.addDocumentToPane(document, 'left')
      documentIdByKey.set(entry.key, document.id)
      return document
    }

    if (!entry.path) {
      return null
    }

    const document = deps.openDocumentState(await deps.documentFiles.openTextFileAtPath(entry.path))
    deps.addDocumentToPane(document, 'left')
    documentIdByKey.set(entry.key, document.id)
    return document
  }

  function applyRecoverySnapshotToDocument(document: OpenDocument, entry: RecoverySnapshot) {
    document.fileFormat = entry.fileFormat
    const nextDocument = deps.applyDocumentUpdate(document.id, document.revision, entry.content)

    if (nextDocument) {
      deps.enforceDocumentVisualSafety(nextDocument)
    }
  }

  async function inspectRecoverySnapshots(documentIdByKey: Map<string, string>) {
    for (const entry of [...deps.pendingRecoveryEntries.value]) {
      let currentDocument: OpenDocument | null

      try {
        currentDocument = await ensureRecoveryDocument(entry, documentIdByKey)
      } catch {
        currentDocument = null
      }

      if (entry.kind === 'saved' && currentDocument && currentDocument.content === entry.content) {
        deps.removePendingRecoveryEntry(entry.key)
        continue
      }

      const decision = await deps.openRecoveryDialog({
        title: `Recovered changes for ${entry.name}`,
        message: currentDocument
          ? `Folden found unsaved changes for ${entry.name}.`
          : `Folden found unsaved changes, but the original file could not be reopened automatically.`,
        details: entry.path ?? null,
      })

      if (decision === 'later') {
        continue
      }

      deps.removePendingRecoveryEntry(entry.key)

      if (decision === 'discard') {
        continue
      }

      if (decision === 'open-copy') {
        const copyDocument = deps.createDocumentDraft('', recoveredCopyName(entry.name))
        deps.addDocumentToPane(copyDocument, 'left')
        applyRecoverySnapshotToDocument(copyDocument, entry)
        continue
      }

      const targetDocument = currentDocument ?? await ensureRecoveryDocument(entry, documentIdByKey)

      if (!targetDocument) {
        const copyDocument = deps.createDocumentDraft('', recoveredCopyName(entry.name))
        deps.addDocumentToPane(copyDocument, 'left')
        applyRecoverySnapshotToDocument(copyDocument, entry)
        continue
      }

      applyRecoverySnapshotToDocument(targetDocument, entry)
    }
  }

  async function confirmWindowClose(): Promise<WindowCloseDecision> {
    const dirtyDocumentIds = deps.dirtyDocuments.value.map((document) => document.id)

    if (!dirtyDocumentIds.length) {
      return 'clean'
    }

    const decision = await deps.openUnsavedDialog({
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
      return (await deps.saveDirtyDocuments(dirtyDocumentIds)) ? 'save' : 'cancel'
    }

    return 'discard'
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!deps.dirtyDocuments.value.length) {
      return
    }

    event.preventDefault()
    event.returnValue = ''
  }

  async function finalizeWindowClose(closeDecision: WindowCloseDecision) {
    try {
      if (closeDecision === 'discard') {
        const discardedKeys = new Set(
          deps.dirtyDocuments.value.map((document) => buildSessionDocumentKey(document, normalizePath)),
        )
        deps.discardPendingRecoveryEntries(discardedKeys)
        await deps.sessionStorage.saveSessionState(buildPersistedSessionState())
        await deps.sessionStorage.saveRecoverySnapshots(buildPersistedRecoverySnapshots(discardedKeys))
      } else {
        await deps.sessionStorage.saveSessionState(buildPersistedSessionState())
        await deps.sessionStorage.saveRecoverySnapshots(buildPersistedRecoverySnapshots())
      }
    } catch (error) {
      deps.errorMessage.value = `Could not finalize session data: ${formatError(error)}`
      return false
    }

    return true
  }

  async function handleWindowCloseRequested(event: { preventDefault: () => void }) {
    if (isProgrammaticWindowClose) {
      return
    }

    event.preventDefault()

    const closeDecision = await confirmWindowClose()

    if (closeDecision === 'cancel') {
      return
    }

    if (!(await finalizeWindowClose(closeDecision))) {
      return
    }

    isProgrammaticWindowClose = true

    try {
      await deps.nativeEvents.getCurrentWindow().destroy()
    } finally {
      isProgrammaticWindowClose = false
    }
  }

  function mount(initialText: string) {
    disposed = false
    const currentSubscriptionEpoch = ++subscriptionEpoch
    deps.windowTarget.addEventListener('keydown', deps.handleGlobalKeydown)
    deps.windowTarget.addEventListener('beforeunload', handleBeforeUnload)

    if (!deps.hasNativeRuntime) {
      deps.markRestoreComplete()
      return
    }

    void restoreSessionSnapshot(initialText).catch((error) => {
      deps.markRestoreComplete()
      deps.errorMessage.value = `Could not restore the previous session: ${formatError(error)}`
    })

    void deps.nativeEvents.listen<NativeFsEvent>('folden://fs-event', (event) => {
      deps.handleExternalFileEvent(event.payload)
    }).then((unlisten) => {
      if (disposed || currentSubscriptionEpoch !== subscriptionEpoch) {
        unlisten()
        return
      }

      fsEventUnlisten = unlisten
    })

    void deps.nativeEvents.listen<string | null>('folden://watcher-warning', (event) => {
      deps.setWatcherWarning(event.payload)
    }).then((unlisten) => {
      if (disposed || currentSubscriptionEpoch !== subscriptionEpoch) {
        unlisten()
        return
      }

      watcherWarningUnlisten = unlisten
    })

    void deps.nativeEvents.getCurrentWindow().onCloseRequested(handleWindowCloseRequested).then((unlisten) => {
      if (disposed || currentSubscriptionEpoch !== subscriptionEpoch) {
        unlisten()
        return
      }

      tauriWindowCloseUnlisten = unlisten
    })
  }

  function dispose() {
    disposed = true
    subscriptionEpoch += 1
    deps.windowTarget.removeEventListener('keydown', deps.handleGlobalKeydown)
    deps.windowTarget.removeEventListener('beforeunload', handleBeforeUnload)
    tauriWindowCloseUnlisten?.()
    fsEventUnlisten?.()
    watcherWarningUnlisten?.()
    tauriWindowCloseUnlisten = null
    fsEventUnlisten = null
    watcherWarningUnlisten = null
    deps.disposeExternalChangesController()
    deps.disposeSessionController()
    deps.disposeDocumentWorkflowController()
  }

  return {
    buildPersistedRecoverySnapshots,
    buildPersistedSessionState,
    confirmWindowClose,
    dispose,
    finalizeWindowClose,
    handleBeforeUnload,
    handleWindowCloseRequested,
    inspectRecoverySnapshots,
    mount,
    persistSessionAndRecoveryState,
    restoreSessionSnapshot,
    scheduleSessionPersistence,
    writeSessionAndRecoveryState,
  }
}
