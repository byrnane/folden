import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExternalChangesController } from '../../../../src/application/controllers/externalChangesController'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'

function createDocument(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: 'doc-1',
    nativeId: 'native-1',
    path: 'C:\\Docs\\doc.md',
    workspaceId: 'workspace-1',
    relativePath: 'doc.md',
    name: 'doc.md',
    content: 'content',
    revision: 0,
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

describe('external changes controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces workspace refreshes and document reloads by key', async () => {
    const controller = createExternalChangesController()
    const refresh = vi.fn()
    const reload = vi.fn()

    controller.scheduleWorkspaceRefresh('src', refresh)
    controller.scheduleWorkspaceRefresh('src', refresh)
    controller.scheduleDocumentReload('doc-1', reload)
    controller.scheduleDocumentReload('doc-1', reload)
    await vi.advanceTimersByTimeAsync(180)

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('cleans timers and native listeners on dispose', async () => {
    const controller = createExternalChangesController()
    const unlistenFs = vi.fn()
    const unlistenWarning = vi.fn()
    const refresh = vi.fn()
    const reload = vi.fn()

    controller.setFsEventUnlisten(unlistenFs)
    controller.setWatcherWarningUnlisten(unlistenWarning)
    controller.scheduleWorkspaceRefresh('src', refresh)
    controller.scheduleDocumentReload('doc-1', reload)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(180)

    expect(unlistenFs).toHaveBeenCalledTimes(1)
    expect(unlistenWarning).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('routes remove, dirty-change, and clean-change events to document handlers', () => {
    const controller = createExternalChangesController()
    const cleanDocument = createDocument()
    const dirtyDocument = createDocument({ revision: 2, persistedRevision: 1 })
    const routes = {
      findDocumentByPath: vi.fn((path: string) => (
        path.endsWith('dirty.md') ? dirtyDocument : cleanDocument
      )),
      workspaceRelativePathFromAbsolute: vi.fn(() => 'doc.md'),
      scheduleWorkspaceRefresh: vi.fn(),
      scheduleDocumentReload: vi.fn(),
      markDocumentMissing: vi.fn(),
      markDocumentConflict: vi.fn(),
      clearDocumentExternalState: vi.fn(),
    }

    controller.handleExternalFileEvent({ kind: 'remove', path: 'C:\\Docs\\doc.md' }, routes)
    controller.handleExternalFileEvent({ kind: 'modify', path: 'C:\\Docs\\dirty.md' }, routes)
    controller.handleExternalFileEvent({ kind: 'modify', path: 'C:\\Docs\\doc.md' }, routes)

    expect(routes.scheduleWorkspaceRefresh).toHaveBeenCalledTimes(3)
    expect(routes.markDocumentMissing).toHaveBeenCalledWith(cleanDocument.id, 'doc.md was moved or deleted outside Folden.')
    expect(routes.markDocumentConflict).toHaveBeenCalledWith(dirtyDocument.id, 'doc.md changed on disk while you have unsaved edits.')
    expect(routes.clearDocumentExternalState).toHaveBeenCalledWith(cleanDocument.id)
    expect(routes.scheduleDocumentReload).toHaveBeenCalledWith(cleanDocument.id)
  })
})
