import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionController } from '../../../../src/application/controllers/sessionController'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import type { RecoverySnapshot } from '../../../../src/application/sessionRecovery'

function createDocument(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: 'doc-1',
    nativeId: 'native-1',
    path: 'C:\\Docs\\doc.md',
    workspaceId: 'workspace-1',
    relativePath: 'doc.md',
    name: 'doc.md',
    content: 'content',
    revision: 1,
    persistedRevision: 0,
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

function createRecoverySnapshot(key: string): RecoverySnapshot {
  return {
    key,
    kind: 'scratch',
    path: null,
    workspaceRootPath: null,
    relativePath: null,
    name: `${key}.md`,
    content: key,
    fileFormat: createTextFileFormat(),
    fingerprint: null,
    updatedAtMs: 1,
  }
}

describe('session controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces persistence until restore is complete', async () => {
    const controller = createSessionController(true)
    const persist = vi.fn().mockResolvedValue(undefined)

    controller.scheduleSessionPersistence(persist)
    await vi.advanceTimersByTimeAsync(300)
    expect(persist).not.toHaveBeenCalled()

    controller.markRestoreComplete()
    controller.scheduleSessionPersistence(persist)
    controller.scheduleSessionPersistence(persist)
    await vi.advanceTimersByTimeAsync(249)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('serializes parallel persistence and reruns once when requested during a save', async () => {
    const controller = createSessionController(true)
    controller.markRestoreComplete()
    let resolvePersist!: () => void
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = resolve
        }),
    )

    const first = controller.persistSessionAndRecoveryState(persist)
    const second = controller.persistSessionAndRecoveryState(persist)

    expect(persist).toHaveBeenCalledTimes(1)
    resolvePersist()
    await first
    await second

    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('builds session and recovery snapshots from controller-owned pending recovery state', () => {
    const controller = createSessionController(true)
    const document = createDocument()

    controller.setPendingRecoveryEntries([createRecoverySnapshot('old')])

    const session = controller.buildPersistedSessionState({
      documents: [document],
      workspace: { id: 'workspace-1', rootPath: 'C:\\Docs' },
      splitEnabled: false,
      activePaneId: 'left',
      panes: [
        { id: 'left', title: 'Main', documentIds: [document.id], activeDocumentId: document.id },
      ],
      paneDocumentModes: { [`left:${document.id}`]: 'source' },
      normalizePath: (path) => path.toLowerCase(),
      getDocument: () => document,
    })
    const recovery = controller.buildPersistedRecoverySnapshots({
      documents: [document],
      workspace: { id: 'workspace-1', rootPath: 'C:\\Docs' },
      isDirty: () => true,
      normalizePath: (path) => path.toLowerCase(),
    })

    expect(session.workspaceRootPath).toBe('C:\\Docs')
    expect(session.panes[0]?.documentKeys).toEqual(['file:c:\\docs\\doc.md'])
    expect(session.paneModes).toEqual([
      { paneId: 'left', documentKey: 'file:c:\\docs\\doc.md', mode: 'source' },
    ])
    expect(recovery.map((entry) => entry.key)).toEqual(['file:c:\\docs\\doc.md', 'old'])
  })

  it('removes pending recovery entries and clears timers on cleanup', async () => {
    const controller = createSessionController(true)
    const persist = vi.fn().mockResolvedValue(undefined)
    controller.markRestoreComplete()
    controller.setPendingRecoveryEntries([createRecoverySnapshot('a'), createRecoverySnapshot('b')])

    controller.removePendingRecoveryEntry('a')
    controller.scheduleSessionPersistence(persist)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(300)

    expect(controller.pendingRecoveryEntries.value.map((entry) => entry.key)).toEqual(['b'])
    expect(persist).not.toHaveBeenCalled()
  })

  it('keeps every active dirty document beyond the deferred recovery retention limit', () => {
    const controller = createSessionController(true)
    const documents = Array.from({ length: 70 }, (_, index) =>
      createDocument({ id: `dirty-${index}`, path: null, content: `unsaved-${index}` }),
    )
    controller.setPendingRecoveryEntries(
      Array.from({ length: 80 }, (_, index) => createRecoverySnapshot(`old-${index}`)),
    )

    const snapshots = controller.buildPersistedRecoverySnapshots({
      documents,
      workspace: null,
      isDirty: () => true,
      normalizePath: (path) => path,
    })

    expect(snapshots.filter((entry) => entry.key.startsWith('scratch:dirty-'))).toHaveLength(70)
    expect(snapshots.filter((entry) => entry.key.startsWith('old-'))).toHaveLength(64)
    expect(snapshots.find((entry) => entry.key === 'scratch:dirty-69')?.content).toBe('unsaved-69')
  })
})
