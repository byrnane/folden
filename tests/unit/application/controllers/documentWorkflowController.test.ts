import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createDocumentWorkflowController } from '../../../../src/application/controllers/documentWorkflowController'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import type { EditorPane } from '../../../../src/application/types/shell'
import type { OpenedDocument } from '../../../../src/infrastructure/tauri/files'

const nativeFiles = vi.hoisted(() => ({
  closeNativeDocuments: vi.fn().mockResolvedValue(undefined),
  openTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}))

vi.mock('../../../../src/infrastructure/tauri/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/infrastructure/tauri/files')>()),
  closeNativeDocuments: nativeFiles.closeNativeDocuments,
  openTextFile: nativeFiles.openTextFile,
  saveTextFile: nativeFiles.saveTextFile,
}))

function createDocument(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: 'doc-1',
    nativeId: 'native-1',
    path: 'C:\\Docs\\doc.md',
    workspaceId: 'workspace-1',
    relativePath: 'doc.md',
    name: 'doc.md',
    content: 'before',
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

function createOpenedDocument(overrides: Partial<OpenedDocument> = {}): OpenedDocument {
  return {
    id: 'native-1',
    path: 'C:\\Docs\\doc.md',
    workspaceId: 'workspace-1',
    relativePath: 'doc.md',
    content: 'disk',
    fileFormat: createTextFileFormat(),
    fingerprint: { size: 4, modifiedAtMs: 10 },
    ...overrides,
  }
}

function createHarness(document = createDocument()) {
  const documents = ref([document])
  const panes = ref<EditorPane[]>([
    { id: 'left', title: 'Main', documentIds: [document.id], activeDocumentId: document.id },
    { id: 'right', title: 'Split', documentIds: [], activeDocumentId: null },
  ])
  const activePaneId = ref<EditorPane['id']>('left')
  const activePane = computed(() => panes.value.find((pane) => pane.id === activePaneId.value))
  const activeDocument = computed(() => document)
  const paneEditors = ref({
    left: {
      flushContent: vi.fn(() => document.content),
    },
  })
  const removedDocumentIds: string[][] = []

  const deps = {
    initialText: '# Untitled\n\nStart writing in Folden.\n',
    appSettings: ref({ autosave: { enabled: true, debounceMs: 25 } }),
    activeDocument,
    activePane,
    activePaneId,
    visiblePanes: computed(() => panes.value),
    paneEditors,
    workspace: ref({ id: 'workspace-1', rootPath: 'C:\\Docs' }),
    isFileBusy: ref(false),
    errorMessage: ref<string | null>(null),
    isDirty: (candidate: OpenDocument) => candidate.revision !== candidate.persistedRevision,
    hasUnsafeUnacknowledgedVisualState: vi.fn(() => false),
    enforceDocumentVisualSafety: vi.fn(),
    clearRemoteImagePermissions: vi.fn(),
    setSelectedPath: vi.fn(),
    refreshWorkspaceBranch: vi.fn().mockResolvedValue(undefined),
    runFileTask: vi.fn(async (task: () => Promise<void>) => {
      await task()
    }),
    openUnsavedDialog: vi.fn(),
    openConflictDialog: vi.fn(),
    getPane: vi.fn((paneId: EditorPane['id']) => panes.value.find((pane) => pane.id === paneId) ?? null),
    getPaneSnapshot: vi.fn(() => panes.value),
    setActiveDocument: vi.fn((_pane: EditorPane, documentId: string) => {
      panes.value[0]!.activeDocumentId = documentId
    }),
    addDocumentToPaneState: vi.fn((nextDocument: OpenDocument, paneId = activePaneId.value) => {
      const pane = panes.value.find((candidate) => candidate.id === paneId)
      if (pane && !pane.documentIds.includes(nextDocument.id)) {
        pane.documentIds.push(nextDocument.id)
      }
      return pane ?? null
    }),
    removeDocumentFromPane: vi.fn((paneId: EditorPane['id'], documentId: string) => {
      const pane = panes.value.find((candidate) => candidate.id === paneId)
      if (!pane?.documentIds.includes(documentId)) {
        return { removedDocumentIds: [] }
      }
      pane.documentIds = pane.documentIds.filter((id) => id !== documentId)
      removedDocumentIds.push([documentId])
      return { removedDocumentIds: [documentId] }
    }),
    removeDocumentsFromPaneState: vi.fn((documentIds: string[]) => ({ removedDocumentIds: documentIds })),
    ensureViewSession: vi.fn(() => ({ id: 'left:doc-1' })),
    getDocumentMode: vi.fn(() => 'visual' as const),
    applyDocumentUpdateToSessions: vi.fn((update, _nextDocument: OpenDocument, applyUpdate) =>
      applyUpdate(update.documentId, update.baseRevision, update.nextContent),
    ),
    updateDocumentSessions: vi.fn(),
    createDocumentDraft: vi.fn((content: string, name = 'Untitled.md') => createDocument({
      id: `scratch-${Math.random()}`,
      nativeId: null,
      path: null,
      workspaceId: null,
      relativePath: null,
      name,
      content,
      revision: 0,
      persistedRevision: 0,
    })),
    openDocumentState: vi.fn((opened: OpenedDocument) => {
      const nextDocument = createDocument({
        id: 'doc-opened',
        nativeId: opened.id,
        path: opened.path,
        workspaceId: opened.workspaceId,
        relativePath: opened.relativePath,
        content: opened.content,
        persistedRevision: 0,
        revision: 0,
      })
      documents.value.push(nextDocument)
      return nextDocument
    }),
    getDocument: vi.fn((documentId: string) => documents.value.find((candidate) => candidate.id === documentId) ?? null),
    applyDocumentUpdate: vi.fn((_documentId: string, _baseRevision: number, nextContent: string) => {
      document.content = nextContent
      document.revision += 1
      return document
    }),
    undoDocument: vi.fn(),
    redoDocument: vi.fn(),
    markDocumentQueued: vi.fn(() => document),
    markDocumentSaving: vi.fn(() => document),
    markDocumentSaved: vi.fn((_documentId: string, revision: number, savedDocument: OpenedDocument) => {
      document.persistedRevision = revision
      document.path = savedDocument.path
      document.nativeId = savedDocument.id
      document.relativePath = savedDocument.relativePath
      return document
    }),
    markDocumentSaveError: vi.fn(() => document),
    replaceDocumentFromDisk: vi.fn((_documentId: string, opened: OpenedDocument) => {
      document.content = opened.content
      document.revision += 1
      document.persistedRevision = document.revision
      document.diskFingerprint = opened.fingerprint
      document.externalState = 'idle'
      return document
    }),
    markDocumentConflict: vi.fn(() => document),
    markDocumentMissing: vi.fn(() => document),
    acknowledgeDocumentConflict: vi.fn((_documentId: string, fingerprint) => {
      document.diskFingerprint = fingerprint
      document.externalState = 'idle'
      document.revision += 1
      return document
    }),
    removeDocuments: vi.fn((documentIds: string[]) => {
      documents.value = documents.value.filter((candidate) => !documentIds.includes(candidate.id))
    }),
    openWorkspaceFileByPath: vi.fn(),
    openAbsoluteTextFile: vi.fn(),
  }

  return {
    controller: createDocumentWorkflowController(deps),
    deps,
    document,
    paneEditors,
    removedDocumentIds,
  }
}

describe('document workflow controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes editor content before manual save and persists through the save queue', async () => {
    const { controller, document, paneEditors, deps } = createHarness()
    paneEditors.value.left.flushContent.mockReturnValue('after')
    nativeFiles.saveTextFile.mockResolvedValue(createOpenedDocument({ content: 'after' }))

    await controller.saveDocument(document)

    expect(deps.applyDocumentUpdate).toHaveBeenCalledWith(document.id, 1, 'after')
    expect(nativeFiles.saveTextFile).toHaveBeenCalledWith('native-1', 'after', null, document.fileFormat, undefined)
    expect(deps.markDocumentSaved).toHaveBeenCalled()
  })

  it('debounces autosave and clears pending timers on dispose', async () => {
    const { controller, document } = createHarness()
    nativeFiles.saveTextFile.mockResolvedValue(createOpenedDocument({ content: document.content }))

    controller.syncAutosaveTimers([document])
    await vi.advanceTimersByTimeAsync(24)
    expect(nativeFiles.saveTextFile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(nativeFiles.saveTextFile).toHaveBeenCalledTimes(1)

    controller.syncAutosaveTimers([document])
    controller.dispose()
    await vi.advanceTimersByTimeAsync(25)
    expect(nativeFiles.saveTextFile).toHaveBeenCalledTimes(1)
  })

  it('handles dirty close decisions without dropping cancelled documents', async () => {
    const { controller, deps, document } = createHarness()
    deps.openUnsavedDialog.mockResolvedValueOnce('cancel')

    await controller.closeDocument({ id: 'left', title: 'Main', documentIds: [document.id], activeDocumentId: document.id }, document.id)
    expect(deps.removeDocuments).not.toHaveBeenCalled()

    deps.openUnsavedDialog.mockResolvedValueOnce('discard')
    await controller.closeDocument({ id: 'left', title: 'Main', documentIds: [document.id], activeDocumentId: document.id }, document.id)
    expect(deps.removeDocuments).toHaveBeenCalledWith([document.id])
    expect(nativeFiles.closeNativeDocuments).toHaveBeenCalledWith(['native-1'])
  })

  it('reloads a clean document from disk', async () => {
    const cleanDocument = createDocument({ revision: 1, persistedRevision: 1 })
    const { controller, deps } = createHarness(cleanDocument)
    deps.openWorkspaceFileByPath.mockResolvedValue(createOpenedDocument({ content: 'from disk' }))

    await controller.reloadDocumentFromDisk(cleanDocument.id)

    expect(deps.replaceDocumentFromDisk).toHaveBeenCalledWith(cleanDocument.id, expect.objectContaining({ content: 'from disk' }))
    expect(deps.updateDocumentSessions).toHaveBeenCalled()
  })

  it('resolves conflicts by keeping Folden content or applying merged content', async () => {
    const { controller, deps, document } = createHarness()
    deps.openWorkspaceFileByPath.mockResolvedValue(createOpenedDocument({ content: 'disk' }))
    deps.openConflictDialog.mockResolvedValueOnce({ kind: 'keep-folden' })

    await controller.openConflictResolution(document.id)
    expect(deps.acknowledgeDocumentConflict).toHaveBeenCalled()

    deps.openConflictDialog.mockResolvedValueOnce({ kind: 'apply-merged', content: 'merged' })
    await controller.openConflictResolution(document.id)
    expect(deps.applyDocumentUpdate).toHaveBeenCalledWith(document.id, 2, 'merged')
  })
})
