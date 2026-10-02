import { beforeEach, describe, expect, it, vi } from 'vitest'
import { language } from '../../../../src/application/i18n'
import { ref } from 'vue'
import { createApplicationLifecycleController } from '../../../../src/application/controllers/applicationLifecycleController'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import type {
  PersistedSessionState,
  RecoverySnapshot,
} from '../../../../src/application/sessionRecovery'
import type { EditorPane } from '../../../../src/application/types/shell'

beforeEach(() => {
  language.value = 'en'
})

function createDocument(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: 'doc-1',
    nativeId: 'native-1',
    path: 'C:\\Docs\\doc.md',
    workspaceId: 'workspace-1',
    relativePath: 'doc.md',
    name: 'doc.md',
    content: 'disk',
    revision: 1,
    persistedRevision: 1,
    defaultMode: 'visual',
    fileFormat: createTextFileFormat(),
    diskFingerprint: null,
    saveState: 'idle',
    saveError: null,
    externalState: 'idle',
    externalMessage: null,
    history: {
      past: [],
      future: [],
    },
    ...overrides,
  }
}

function createRecoverySnapshot(overrides: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  return {
    key: 'file:c:\\docs\\doc.md',
    kind: 'saved',
    path: 'C:\\Docs\\doc.md',
    workspaceRootPath: 'C:\\Docs',
    relativePath: 'doc.md',
    name: 'doc.md',
    content: 'recovered',
    fileFormat: createTextFileFormat(),
    fingerprint: null,
    updatedAtMs: 1,
    ...overrides,
  }
}

function createSession(): PersistedSessionState {
  return {
    workspaceRootPath: 'C:\\Docs',
    splitEnabled: false,
    activePaneId: 'left',
    panes: [
      {
        id: 'left',
        documentKeys: ['file:c:\\docs\\doc.md'],
        activeDocumentKey: 'file:c:\\docs\\doc.md',
      },
    ],
    documents: [
      {
        key: 'file:c:\\docs\\doc.md',
        kind: 'saved',
        path: 'C:\\Docs\\doc.md',
        workspaceRootPath: 'C:\\Docs',
        relativePath: 'doc.md',
        name: 'doc.md',
      },
    ],
    paneModes: [],
  }
}

function createHarness() {
  const document = createDocument()
  const documents = ref<OpenDocument[]>([])
  const dirtyDocuments = ref<OpenDocument[]>([])
  const pendingRecoveryEntries = ref<RecoverySnapshot[]>([])
  const listeners = new Map<string, unknown>()
  const unlistenFs = vi.fn()
  const unlistenWarning = vi.fn()
  const unlistenClose = vi.fn()
  let closeHandler: ((event: { preventDefault: () => void }) => Promise<void> | void) | null = null
  const currentWindow = {
    onCloseRequested: vi.fn(async (handler) => {
      closeHandler = handler
      return unlistenClose
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
  const loadSessionState = vi.fn().mockResolvedValue(createSession())
  const loadRecoverySnapshots = vi
    .fn()
    .mockResolvedValue({ entries: [createRecoverySnapshot()], diagnostics: [] })
  const saveSessionState = vi.fn().mockResolvedValue(undefined)
  const saveRecoverySnapshots = vi.fn().mockResolvedValue(undefined)
  const restoreWorkspaceByPath = vi
    .fn()
    .mockResolvedValue({ id: 'workspace-1', rootPath: 'C:\\Docs', name: 'Docs' })
  const openTextFileByPath = vi.fn().mockResolvedValue({
    id: 'native-1',
    path: 'C:\\Docs\\doc.md',
    workspaceId: 'workspace-1',
    relativePath: 'doc.md',
    content: document.content,
    fileFormat: createTextFileFormat(),
    fingerprint: null,
  })
  const openTextFileAtPath = vi.fn()
  const listen = vi.fn(async (event: string) =>
    event === 'folden://fs-event' ? unlistenFs : unlistenWarning,
  )
  const getCurrentWindow = vi.fn(() => currentWindow)

  const deps = {
    documentFiles: {
      closeNativeDocuments: vi.fn(),
      openTextFile: vi.fn(),
      openTextFileAtPath,
      openTextFileByPath,
      saveTextFile: vi.fn(),
      importImageFromPicker: vi.fn(),
      importImageData: vi.fn(),
    },
    workspaceFiles: {
      createDirectory: vi.fn(),
      createFile: vi.fn(),
      listDirectory: vi.fn(),
      syncWorkspaceWatchScope: vi.fn(),
      loadWorkspaceSettings: vi.fn(),
      openTextFileByPath,
      openWorkspaceDirectory: vi.fn(),
      renamePath: vi.fn(),
      movePath: vi.fn(),
      startWorkspaceSearch: vi.fn(),
      listWorkspaceFiles: vi.fn(),
      cancelWorkspaceSearch: vi.fn(),
      restoreWorkspaceByPath,
      saveWorkspaceSettings: vi.fn(),
      trashPath: vi.fn(),
    },
    sessionStorage: {
      loadRecoverySnapshots,
      loadSessionState,
      saveRecoverySnapshots,
      saveSessionState,
    },
    nativeEvents: {
      getCurrentWindow,
      listen,
    },
    hasNativeRuntime: true,
    windowTarget: {
      addEventListener: vi.fn(
        (
          type: 'keydown' | 'beforeunload',
          listener: ((event: KeyboardEvent) => void) | ((event: BeforeUnloadEvent) => void),
        ) => {
          listeners.set(type, listener)
        },
      ),
      removeEventListener: vi.fn(
        (
          type: 'keydown' | 'beforeunload',
          listener: ((event: KeyboardEvent) => void) | ((event: BeforeUnloadEvent) => void),
        ) => {
          if (listeners.get(type) === listener) {
            listeners.delete(type)
          }
        },
      ),
    },
    errorMessage: ref<string | null>(null),
    workspace: ref<{ id: string; rootPath: string } | null>(null),
    documents,
    dirtyDocuments,
    paneDocumentModes: ref({}),
    splitEnabled: ref(false),
    activePaneId: ref<EditorPane['id']>('left'),
    pendingRecoveryEntries,
    handleGlobalKeydown: vi.fn(),
    handleExternalFileEvent: vi.fn(),
    setWatcherWarning: vi.fn(),
    loadWorkspace: vi.fn(async () => {
      deps.workspace.value = { id: 'workspace-1', rootPath: 'C:\\Docs' }
    }),
    clearRestoredLayout: vi.fn(() => {
      documents.value = []
    }),
    addDocumentToPane: vi.fn(),
    createDocumentDraft: vi.fn((content: string, name = 'Untitled.md') =>
      createDocument({
        id: `scratch-${documents.value.length}`,
        nativeId: null,
        path: null,
        workspaceId: null,
        relativePath: null,
        name,
        content,
        revision: 0,
        persistedRevision: 0,
      }),
    ),
    openDocumentState: vi.fn((opened) => {
      const nextDocument = createDocument({
        id: 'doc-1',
        content: opened.content,
        path: opened.path,
        workspaceId: opened.workspaceId,
        relativePath: opened.relativePath,
      })
      documents.value.push(nextDocument)
      return nextDocument
    }),
    getDocument: vi.fn(
      (documentId: string) =>
        documents.value.find((candidate) => candidate.id === documentId) ?? null,
    ),
    applyDocumentUpdate: vi.fn((documentId: string, _revision: number, content: string) => {
      const target = documents.value.find((candidate) => candidate.id === documentId)
      if (!target) {
        return null
      }
      target.content = content
      target.revision += 1
      return target
    }),
    enforceDocumentVisualSafety: vi.fn(),
    setFallbackDocument: vi.fn((fallback: OpenDocument) => {
      documents.value.push(fallback)
    }),
    restoreLayout: vi.fn(() => new Set(['doc-1'])),
    getPaneSnapshot: vi.fn(() => []),
    paneDocumentModeKey: vi.fn(
      (paneId: EditorPane['id'], documentId: string) => `${paneId}:${documentId}`,
    ),
    isDirty: vi.fn((candidate: OpenDocument) => candidate.revision !== candidate.persistedRevision),
    saveDirtyDocuments: vi.fn().mockResolvedValue(true),
    markRestoreComplete: vi.fn(),
    setPendingRecoveryEntries: vi.fn((entries: RecoverySnapshot[]) => {
      pendingRecoveryEntries.value = entries
    }),
    removePendingRecoveryEntry: vi.fn((key: string) => {
      pendingRecoveryEntries.value = pendingRecoveryEntries.value.filter(
        (entry) => entry.key !== key,
      )
    }),
    discardPendingRecoveryEntries: vi.fn(),
    buildPersistedSessionState: vi.fn(createSession),
    buildPersistedRecoverySnapshots: vi.fn(() => pendingRecoveryEntries.value),
    persistSessionAndRecoveryState: vi.fn().mockResolvedValue(undefined),
    scheduleSessionPersistence: vi.fn(),
    disposeSessionController: vi.fn(),
    disposeExternalChangesController: vi.fn(),
    disposeDocumentWorkflowController: vi.fn(),
    loadSessionState,
    loadRecoverySnapshots,
    saveSessionState,
    saveRecoverySnapshots,
    restoreWorkspaceByPath,
    openTextFileByPath,
    openTextFileAtPath,
    openRecoveryDialog: vi.fn().mockResolvedValue('restore' as const),
    openUnsavedDialog: vi.fn(),
    listen,
    getCurrentWindow,
  }

  const controller = createApplicationLifecycleController(deps)

  return {
    closeEvent: { preventDefault: vi.fn() },
    controller,
    deps,
    document,
    currentWindow,
    listeners,
    unlistenClose,
    unlistenFs,
    unlistenWarning,
    get closeHandler() {
      return closeHandler
    },
  }
}

describe('application lifecycle controller', () => {
  it('restores an unavailable original as a copy and continues with remaining snapshots', async () => {
    const { controller, deps, document } = createHarness()
    const missing = createRecoverySnapshot({
      key: 'file:c:\\docs\\missing.md',
      path: 'C:\\Docs\\missing.md',
      name: 'missing.md',
      content: 'missing original recovered text',
    })
    const existing = createRecoverySnapshot()
    deps.documents.value = [document]
    deps.pendingRecoveryEntries.value = [missing, existing]
    deps.openTextFileAtPath.mockRejectedValue(new Error('file missing'))
    deps.createDocumentDraft.mockImplementation((content, name = 'Untitled.md') => {
      const draft = createDocument({
        id: 'recovered-copy',
        nativeId: null,
        path: null,
        workspaceId: null,
        relativePath: null,
        name,
        content,
      })
      deps.documents.value.push(draft)
      return draft
    })

    await controller.inspectRecoverySnapshots(new Map([[existing.key, document.id]]))

    expect(deps.openTextFileAtPath).toHaveBeenCalledOnce()
    expect(deps.documents.value.find((entry) => entry.id === 'recovered-copy')).toMatchObject({
      name: 'missing (Recovered).md',
      content: missing.content,
      path: null,
    })
    expect(deps.documents.value.find((entry) => entry.id === document.id)?.content).toBe(
      existing.content,
    )
    expect(deps.pendingRecoveryEntries.value).toEqual([])
    expect(deps.errorMessage.value).toBeNull()
  })

  it('retains an unapplied recovery snapshot and continues restoring other documents', async () => {
    const { controller, deps, document } = createHarness()
    const first = createRecoverySnapshot()
    const second = createRecoverySnapshot({ key: 'second', name: 'second.md', content: 'second' })
    deps.documents.value = [document, createDocument({ id: 'doc-2', name: 'second.md' })]
    deps.pendingRecoveryEntries.value = [first, second]
    deps.applyDocumentUpdate.mockReturnValueOnce(null)

    await controller.inspectRecoverySnapshots(
      new Map([
        [first.key, document.id],
        [second.key, 'doc-2'],
      ]),
    )

    expect(deps.pendingRecoveryEntries.value).toEqual([first])
    expect(deps.removePendingRecoveryEntry).toHaveBeenCalledExactlyOnceWith(second.key)
    expect(deps.documents.value.find((entry) => entry.id === 'doc-2')?.content).toBe('second')
    expect(deps.errorMessage.value).toContain('Could not apply recovered changes.')
  })

  it('restores session documents and applies recovery decisions on startup', async () => {
    const { controller, deps } = createHarness()

    await controller.restoreSessionSnapshot('# Untitled\n\n')

    expect(deps.loadWorkspace).toHaveBeenCalled()
    expect(deps.openDocumentState).toHaveBeenCalled()
    expect(deps.openRecoveryDialog).toHaveBeenCalled()
    expect(deps.applyDocumentUpdate).toHaveBeenCalledWith('doc-1', 1, 'recovered')
    expect(deps.markRestoreComplete).toHaveBeenCalled()
  })

  it('handles beforeunload only when documents are dirty', () => {
    const { controller, deps } = createHarness()
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    } as unknown as BeforeUnloadEvent

    controller.handleBeforeUnload(event)
    expect(event.preventDefault).not.toHaveBeenCalled()

    deps.dirtyDocuments.value = [createDocument({ revision: 2, persistedRevision: 1 })]
    controller.handleBeforeUnload(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.returnValue).toBe('')
  })

  it('supports window close save, discard, and cancel decisions', async () => {
    const { controller, deps, closeEvent } = createHarness()
    deps.dirtyDocuments.value = [createDocument({ revision: 2, persistedRevision: 1 })]

    deps.openUnsavedDialog.mockResolvedValueOnce('cancel')
    await controller.handleWindowCloseRequested(closeEvent)
    expect(closeEvent.preventDefault).toHaveBeenCalled()
    expect(deps.persistSessionAndRecoveryState).not.toHaveBeenCalled()

    deps.openUnsavedDialog.mockResolvedValueOnce('save')
    await controller.handleWindowCloseRequested(closeEvent)
    expect(deps.saveDirtyDocuments).toHaveBeenCalled()
    expect(deps.saveSessionState).toHaveBeenCalled()
    expect(deps.saveRecoverySnapshots).toHaveBeenCalled()

    deps.openUnsavedDialog.mockResolvedValueOnce('discard')
    await controller.handleWindowCloseRequested(closeEvent)
    expect(deps.discardPendingRecoveryEntries).toHaveBeenCalled()
    expect(deps.saveRecoverySnapshots).toHaveBeenCalled()
  })

  it('keeps the window open and surfaces persistence errors on close', async () => {
    const { controller, deps, closeEvent, currentWindow } = createHarness()
    deps.persistSessionAndRecoveryState.mockRejectedValue(
      new Error('background wrapper should not be used'),
    )
    deps.saveSessionState.mockRejectedValueOnce(new Error('disk is read-only'))

    await controller.handleWindowCloseRequested(closeEvent)

    expect(closeEvent.preventDefault).toHaveBeenCalled()
    expect(deps.saveSessionState).toHaveBeenCalled()
    expect(deps.saveRecoverySnapshots).not.toHaveBeenCalled()
    expect(currentWindow.destroy).not.toHaveBeenCalled()
    expect(deps.errorMessage.value).toContain('Could not finalize session data')
    expect(deps.errorMessage.value).toContain('disk is read-only')
  })

  it('mounts native subscriptions and cleans listeners on dispose', async () => {
    const { controller, deps, listeners, unlistenClose, unlistenFs, unlistenWarning } =
      createHarness()

    controller.mount('# Untitled\n\n')
    await Promise.resolve()

    expect(deps.windowTarget.addEventListener).toHaveBeenCalledWith(
      'keydown',
      deps.handleGlobalKeydown,
    )
    expect(listeners.has('beforeunload')).toBe(true)
    expect(deps.listen).toHaveBeenCalledWith('folden://fs-event', expect.any(Function))

    controller.dispose()

    expect(unlistenClose).toHaveBeenCalled()
    expect(unlistenFs).toHaveBeenCalled()
    expect(unlistenWarning).toHaveBeenCalled()
    expect(deps.disposeSessionController).toHaveBeenCalled()
    expect(deps.disposeDocumentWorkflowController).toHaveBeenCalled()
  })

  it('immediately unlistens subscriptions resolved after dispose', async () => {
    const { controller, deps, unlistenClose, unlistenFs, unlistenWarning } = createHarness()
    const fsListenerPromise = Promise.resolve(unlistenFs)
    const warningListenerPromise = Promise.resolve(unlistenWarning)
    const closeListenerPromise = Promise.resolve(unlistenClose)

    deps.listen.mockReturnValueOnce(fsListenerPromise).mockReturnValueOnce(warningListenerPromise)
    deps.getCurrentWindow().onCloseRequested.mockReturnValueOnce(closeListenerPromise)

    controller.mount('# Untitled\n\n')
    controller.dispose()
    await Promise.all([fsListenerPromise, warningListenerPromise, closeListenerPromise])
    await Promise.resolve()

    expect(unlistenFs).toHaveBeenCalledTimes(1)
    expect(unlistenWarning).toHaveBeenCalledTimes(1)
    expect(unlistenClose).toHaveBeenCalledTimes(1)

    controller.dispose()

    expect(unlistenFs).toHaveBeenCalledTimes(1)
    expect(unlistenWarning).toHaveBeenCalledTimes(1)
    expect(unlistenClose).toHaveBeenCalledTimes(1)
  })
})
