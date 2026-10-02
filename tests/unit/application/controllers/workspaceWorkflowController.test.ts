import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { language } from '../../../../src/application/i18n'
import { createWorkspaceWorkflowController } from '../../../../src/application/controllers/workspaceWorkflowController'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import type { WorkspaceDescriptor, WorkspaceEntry } from '../../../../src/domain/native'
import type { EditorPane } from '../../../../src/application/types/shell'

beforeEach(() => {
  language.value = 'en'
})

function file(path: string): WorkspaceEntry {
  return {
    name: path.split('\\').at(-1) ?? path,
    path,
    kind: 'file',
    openableState: 'present',
    children: [],
  }
}

function directory(path: string, children: WorkspaceEntry[] = []): WorkspaceEntry {
  return {
    name: path.split('\\').at(-1) ?? path,
    path,
    kind: 'directory',
    openableState: children.some(
      (entry) => entry.kind === 'file' || entry.openableState === 'present',
    )
      ? 'present'
      : children.length
        ? 'unknown'
        : 'empty',
    children,
  }
}

function createDocument(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: 'doc-1',
    nativeId: 'native-1',
    path: 'C:\\Docs\\drafts\\a.md',
    workspaceId: 'workspace-1',
    relativePath: 'drafts\\a.md',
    name: 'a.md',
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

function createHarness(
  options: {
    workspace?: { id: string; rootPath: string } | null
    documents?: OpenDocument[]
    activePaneId?: EditorPane['id']
  } = {},
) {
  const workspace = ref(options.workspace ?? { id: 'workspace-1', rootPath: 'C:\\Docs' })
  const documents = ref<OpenDocument[]>(options.documents ?? [])
  const expandedWorkspacePaths = ref(new Set<string>())
  const activeDocument = computed(() => documents.value[0] ?? null)
  const activePane = computed<EditorPane | undefined>(() => ({
    id: options.activePaneId ?? 'left',
    title: 'Primary',
    documentIds: documents.value.map((document) => document.id),
    activeDocumentId: documents.value[0]?.id ?? null,
  }))
  const selectedDirectoryPath = computed(() => '')
  const loadedPaths = new Set([''])
  const workspaceFiles = {
    createDirectory: vi.fn(),
    createFile: vi.fn(),
    listDirectory: vi.fn().mockResolvedValue([]),
    syncWorkspaceWatchScope: vi.fn(),
    loadWorkspaceSettings: vi.fn().mockResolvedValue({ ignoredPaths: [] }),
    saveWorkspaceSettings: vi.fn(),
    openTextFileByPath: vi.fn(),
    openWorkspaceDirectory: vi.fn().mockResolvedValue({
      id: 'workspace-2',
      rootPath: 'D:\\Notes',
      name: 'Notes',
    }),
    renamePath: vi.fn(),
    movePath: vi.fn(),
    startWorkspaceSearch: vi.fn(),
    listWorkspaceFiles: vi.fn(),
    cancelWorkspaceSearch: vi.fn(),
    restoreWorkspaceByPath: vi.fn(),
    trashPath: vi.fn(),
  }

  const deps = {
    workspaceFiles,
    workspace,
    documents,
    expandedWorkspacePaths,
    activeDocument,
    activePane,
    selectedDirectoryPath,
    isDirty: vi.fn((document: OpenDocument) => document.revision !== document.persistedRevision),
    runFileTask: vi.fn(async (task: () => Promise<void>) => {
      await task()
    }),
    openUnsavedDialog: vi.fn(),
    openConfirmDialog: vi.fn(),
    openPromptDialog: vi.fn(),
    setWatcherWarning: vi.fn(),
    setWatcherVisibleWorkspace: vi.fn(
      (descriptor: WorkspaceDescriptor, entries: WorkspaceEntry[]) => {
        workspace.value = { id: descriptor.id, rootPath: descriptor.rootPath }
        loadedPaths.clear()
        loadedPaths.add('')
        void entries
      },
    ),
    setWorkspaceSettings: vi.fn(),
    addIgnoredWorkspacePath: vi.fn((path: string) => ({ ignoredPaths: [path] })),
    clearWorkspaceLoadError: vi.fn(),
    setWorkspaceLoadError: vi.fn(),
    setWorkspacePathLoading: vi.fn(),
    setWorkspacePathExpanded: vi.fn(),
    removeWorkspacePathState: vi.fn(),
    remapWorkspacePathState: vi.fn(),
    setSelectedPath: vi.fn(),
    applyWorkspaceBranch: vi.fn((path: string) => {
      loadedPaths.add(path)
    }),
    loadedDescendantPaths: vi.fn((path: string) => (path === '' ? ['src', 'src\\nested'] : [])),
    shouldLoadBranch: vi.fn((path: string) => !loadedPaths.has(path)),
    nearestLoadedWorkspaceBranch: vi.fn((path: string | null) => path ?? ''),
    scheduleWorkspaceRefreshDebounced: vi.fn(),
    getDocument: vi.fn(
      (documentId: string) =>
        documents.value.find((document) => document.id === documentId) ?? null,
    ),
    saveDirtyDocuments: vi.fn().mockResolvedValue(true),
    removeDocumentsFromPanes: vi.fn((documentIds: string[]) => {
      documents.value = documents.value.filter((document) => !documentIds.includes(document.id))
    }),
    normalizePaneState: vi.fn(),
    updateDocumentPaths: vi.fn(),
    openLoadedDocument: vi.fn(),
    openWorkspaceFile: vi.fn(),
    setSplitEnabled: vi.fn(),
    moveDocumentToPane: vi.fn(),
  }

  const controller = createWorkspaceWorkflowController(deps)

  return {
    controller,
    deps,
    loadedPaths,
    workspaceFiles,
  }
}

describe('workspace workflow controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles workspace switch cancel, save, and discard decisions', async () => {
    const dirtyDocument = createDocument({ revision: 2, persistedRevision: 1 })
    const cancelHarness = createHarness({ documents: [dirtyDocument] })
    cancelHarness.deps.openUnsavedDialog.mockResolvedValueOnce('cancel')

    await cancelHarness.controller.openWorkspace()

    expect(cancelHarness.deps.setWatcherVisibleWorkspace).not.toHaveBeenCalled()
    expect(cancelHarness.deps.removeDocumentsFromPanes).not.toHaveBeenCalled()

    const saveHarness = createHarness({ documents: [dirtyDocument] })
    saveHarness.deps.openUnsavedDialog.mockResolvedValueOnce('save')

    await saveHarness.controller.openWorkspace()

    expect(saveHarness.deps.saveDirtyDocuments).toHaveBeenCalledWith(['doc-1'])
    expect(saveHarness.deps.removeDocumentsFromPanes).toHaveBeenCalledWith(['doc-1'])
    expect(saveHarness.deps.setWatcherVisibleWorkspace).toHaveBeenCalled()

    const discardHarness = createHarness({ documents: [dirtyDocument] })
    discardHarness.deps.openUnsavedDialog.mockResolvedValueOnce('discard')

    await discardHarness.controller.openWorkspace()

    expect(discardHarness.deps.saveDirtyDocuments).not.toHaveBeenCalled()
    expect(discardHarness.deps.removeDocumentsFromPanes).toHaveBeenCalledWith(['doc-1'])
    expect(discardHarness.deps.setWatcherVisibleWorkspace).toHaveBeenCalled()
  })

  it('renames workspace paths and updates open document paths', async () => {
    const { controller, deps, workspaceFiles } = createHarness({ documents: [createDocument()] })
    deps.openPromptDialog.mockResolvedValueOnce('archive.md')
    workspaceFiles.renamePath.mockResolvedValueOnce('drafts\\archive.md')

    await controller.renameWorkspacePath(file('drafts\\a.md'))

    expect(workspaceFiles.renamePath).toHaveBeenCalledWith(
      'workspace-1',
      'drafts\\a.md',
      'archive.md',
    )
    expect(deps.remapWorkspacePathState).toHaveBeenCalledWith('drafts\\a.md', 'drafts\\archive.md')
    expect(deps.updateDocumentPaths).toHaveBeenCalledWith(
      'drafts\\a.md',
      'drafts\\archive.md',
      'C:\\Docs',
    )
    expect(deps.setSelectedPath).toHaveBeenCalledWith('drafts\\archive.md')
    expect(workspaceFiles.listDirectory).toHaveBeenCalledWith('workspace-1', 'drafts')
  })

  it('handles trash cancel and confirmation paths', async () => {
    const dirtyHarness = createHarness({
      documents: [createDocument({ revision: 2, persistedRevision: 1 })],
    })
    dirtyHarness.deps.openUnsavedDialog.mockResolvedValueOnce('cancel')

    await dirtyHarness.controller.trashWorkspacePath(directory('drafts'))

    expect(dirtyHarness.workspaceFiles.trashPath).not.toHaveBeenCalled()
    expect(dirtyHarness.deps.removeDocumentsFromPanes).not.toHaveBeenCalled()

    const cleanHarness = createHarness({ documents: [createDocument()] })
    cleanHarness.deps.openConfirmDialog.mockResolvedValueOnce(true)

    await cleanHarness.controller.trashWorkspacePath(directory('drafts'))

    expect(cleanHarness.workspaceFiles.trashPath).toHaveBeenCalledWith('workspace-1', 'drafts')
    expect(cleanHarness.deps.removeWorkspacePathState).toHaveBeenCalledWith('drafts')
    expect(cleanHarness.deps.removeDocumentsFromPanes).toHaveBeenCalledWith(['doc-1'])
    expect(cleanHarness.deps.setSelectedPath).toHaveBeenCalledWith(null)
    expect(cleanHarness.workspaceFiles.listDirectory).toHaveBeenCalledWith('workspace-1', '')
  })

  it('refreshes previously loaded descendant branches', async () => {
    const { controller, deps, workspaceFiles } = createHarness()
    workspaceFiles.listDirectory.mockImplementation(async (_workspaceId, path) => {
      if (path === '') {
        return [directory('src')]
      }

      if (path === 'src') {
        return [directory('src\\nested')]
      }

      return [file('src\\nested\\note.md')]
    })

    await controller.refreshWorkspaceBranch('')

    expect(workspaceFiles.listDirectory).toHaveBeenNthCalledWith(1, 'workspace-1', '')
    expect(workspaceFiles.listDirectory).toHaveBeenNthCalledWith(2, 'workspace-1', 'src')
    expect(workspaceFiles.listDirectory).toHaveBeenNthCalledWith(3, 'workspace-1', 'src\\nested')
    expect(deps.applyWorkspaceBranch).toHaveBeenCalledWith('', [directory('src')])
    expect(deps.applyWorkspaceBranch).toHaveBeenCalledWith('src', [directory('src\\nested')])
    expect(deps.applyWorkspaceBranch).toHaveBeenCalledWith('src\\nested', [
      file('src\\nested\\note.md'),
    ])
  })

  it('records lazy loading errors in workspace load errors', async () => {
    const { controller, deps, workspaceFiles } = createHarness()
    workspaceFiles.listDirectory.mockRejectedValueOnce(new Error('permission denied'))

    await controller.toggleWorkspaceDirectory(directory('src'))

    expect(deps.setWorkspacePathExpanded).toHaveBeenCalledWith('src', true)
    expect(deps.setWorkspacePathLoading).toHaveBeenCalledWith('src', true)
    expect(deps.setWorkspaceLoadError).toHaveBeenCalledWith('src', 'permission denied')
    expect(deps.setWorkspacePathLoading).toHaveBeenCalledWith('src', false)
    expect(deps.setWatcherWarning).toHaveBeenCalledWith(
      'Could not load folder src: permission denied',
    )
  })

  it('hides workspace paths without closing open documents', async () => {
    const { controller, deps, workspaceFiles } = createHarness({ documents: [createDocument()] })

    await controller.hideWorkspacePath(directory('drafts'))

    expect(deps.addIgnoredWorkspacePath).toHaveBeenCalledWith('drafts')
    expect(workspaceFiles.saveWorkspaceSettings).toHaveBeenCalledWith('workspace-1', {
      ignoredPaths: ['drafts'],
    })
    expect(deps.removeWorkspacePathState).toHaveBeenCalledWith('drafts')
    expect(deps.removeDocumentsFromPanes).not.toHaveBeenCalled()
    expect(deps.setSelectedPath).toHaveBeenCalledWith(null)
  })

  it('moves the active document from the left pane to the right pane', () => {
    const document = createDocument()
    const { controller, deps } = createHarness({ documents: [document], activePaneId: 'left' })

    controller.moveActiveDocumentToRight()

    expect(deps.moveDocumentToPane).toHaveBeenCalledWith(document, 'left', 'right')
    expect(deps.setSplitEnabled).not.toHaveBeenCalled()
  })

  it('moves the active document from the right pane to the left pane', () => {
    const document = createDocument()
    const { controller, deps } = createHarness({ documents: [document], activePaneId: 'right' })

    controller.moveActiveDocumentToRight()

    expect(deps.moveDocumentToPane).toHaveBeenCalledWith(document, 'right', 'left')
    expect(deps.setSplitEnabled).not.toHaveBeenCalled()
  })

  it('does not move a tab when there is no active document', () => {
    const { controller, deps } = createHarness({ documents: [], activePaneId: 'left' })

    controller.moveActiveDocumentToRight()

    expect(deps.moveDocumentToPane).not.toHaveBeenCalled()
    expect(deps.setSplitEnabled).not.toHaveBeenCalled()
  })
})
