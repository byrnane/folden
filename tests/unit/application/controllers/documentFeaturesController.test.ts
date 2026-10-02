import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { language } from '../../../../src/application/i18n'
import { createDocumentFeaturesController } from '../../../../src/application/controllers/documentFeaturesController'
import { createDocumentController } from '../../../../src/application/controllers/documentController'
import { createPaneController } from '../../../../src/application/controllers/paneController'
import { defaultApplicationSettings } from '../../../../src/application/settings/defaults'
import type { NativePorts } from '../../../../src/application/ports/nativePorts'
import type { OpenedDocument } from '../../../../src/domain/native'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import { createTextFileFormat } from '../../../../src/domain/document'

const cleanups: (() => void)[] = []
beforeEach(() => {
  language.value = 'en'
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

function harness() {
  const model = createDocumentController('Original text')
  const panes = createPaneController(model.initialDocument)
  const workspace = ref<{ id: string; rootPath: string } | null>({ id: 'ws', rootPath: 'C:\\Docs' })
  const activeDocument = computed(() =>
    model.getDocument(panes.activePane.value?.activeDocumentId ?? ''),
  )
  const insertImage = vi.fn()
  panes.setPaneEditorAdapter('left', {
    flushContent: () => activeDocument.value?.content ?? '',
    insertImportedImage: insertImage,
    search: vi.fn().mockReturnValue(3),
    revealSearch: vi.fn(),
  })
  const files = {
    createFile: vi.fn().mockResolvedValue('notes\\Story.md'),
    movePath: vi.fn().mockResolvedValue('archive\\Story.md'),
    openTextFileByPath: vi.fn().mockResolvedValue({
      id: 'native-story',
      path: 'C:\\Docs\\notes\\Story.md',
      content: '',
      workspaceId: 'ws',
      relativePath: 'notes\\Story.md',
      fileFormat: createTextFileFormat(),
      fingerprint: null,
    } satisfies OpenedDocument),
    importImageFromPicker: vi.fn().mockResolvedValue(null),
    importImageData: vi.fn(),
    cancelWorkspaceSearch: vi.fn().mockResolvedValue(undefined),
  }
  const deps = {
    nativePorts: {
      documents: files,
      workspace: files,
      events: { listen: vi.fn().mockResolvedValue(vi.fn()) },
    } as unknown as Pick<NativePorts, 'documents' | 'workspace' | 'events'>,
    workspace,
    documents: model.documents,
    appSettings: ref(structuredClone(defaultApplicationSettings)),
    ignoredPaths: () => [],
    activePaneId: panes.activePaneId,
    activeDocument,
    activeEditorAdapter: computed(() => panes.paneEditors.value.left ?? null),
    visiblePanes: panes.visiblePanes,
    paneEditors: panes.paneEditors,
    selectedDirectoryPath: computed(() => 'notes'),
    errorMessage: ref<string | null>(null),
    getPane: panes.getPane,
    getDocument: model.getDocument,
    openWorkspaceFile: vi.fn(),
    setPaneDocumentMode: vi.fn(),
    flushPaneEditorContent: vi.fn(),
    shouldLoadRemoteImages: vi.fn().mockReturnValue(false),
    openPromptDialog: vi.fn().mockResolvedValue('Story'),
    openConfirmDialog: vi.fn().mockResolvedValue(true),
    createDocumentDraft: model.createScratchDocument,
    openDocumentState: model.openLoadedDocument,
    applyDocumentUpdate: model.applyDocumentUpdate,
    addDocumentToPane: vi.fn((document: OpenDocument) => {
      panes.addDocumentToPane(document)
    }),
    saveDocument: vi.fn(async (document: OpenDocument) => {
      model.markDocumentSaved(document.id, document.revision, {
        id: document.nativeId ?? 'native-saved',
        content: document.content,
        path: document.path ?? 'C:\\Docs\\Story.md',
        workspaceId: 'ws',
        relativePath: document.relativePath ?? 'Story.md',
        fileFormat: document.fileFormat,
        fingerprint: null,
      })
    }),
    runFileTask: vi.fn(async (task: () => Promise<void>) => {
      await task()
    }),
    refreshWorkspace: vi.fn(),
    remapWorkspacePathState: vi.fn(),
    updateDocumentPaths: model.updateDocumentPaths,
    setSelectedPath: vi.fn(),
  }
  const controller = createDocumentFeaturesController(deps)
  cleanups.push(controller.dispose)
  return { controller, model, panes, deps, files, workspace, insertImage }
}

describe('document features workflows', () => {
  it('applies template content before mounting and persists that revision', async () => {
    const { controller, model, panes, deps, files } = harness()
    await controller.createFromTemplate('game')
    const document = model.getDocument(panes.activePane.value!.activeDocumentId!)!
    expect(document.content).toContain('# Story')
    expect(document.content).toContain('Core loop')
    expect(document.revision).toBeGreaterThan(0)
    expect(document.persistedRevision).toBe(document.revision)
    expect(deps.saveDocument.mock.calls[0]![0].content).toBe(document.content)
    expect(files.createFile).toHaveBeenCalledWith('ws', 'notes', 'Story.md')
    expect(deps.refreshWorkspace).toHaveBeenCalledOnce()
  })

  it('cancels image import when saving a scratch document is cancelled or picker closes', async () => {
    const { controller, model, deps, files, insertImage } = harness()
    deps.saveDocument.mockImplementationOnce(async () => {})
    await controller.importImage('left', model.initialDocument.id, null)
    expect(files.importImageFromPicker).not.toHaveBeenCalled()
    expect(insertImage).not.toHaveBeenCalled()
    await controller.importImage('left', model.initialDocument.id, null)
    expect(files.importImageFromPicker).toHaveBeenCalledWith('native-saved')
    expect(insertImage).not.toHaveBeenCalled()
    expect(deps.errorMessage.value).toBeNull()
  })

  it('flushes and remaps moved document paths while preserving content and native handle', async () => {
    const { controller, model, deps, files } = harness()
    const document = model.openLoadedDocument(await files.openTextFileByPath())
    model.applyDocumentUpdate(document.id, document.revision, 'Unsaved text')
    await controller.moveWorkspacePath(
      { path: 'notes\\Story.md', name: 'Story.md', kind: 'file' },
      'archive',
    )
    const moved = model.getDocument(document.id)!
    expect(moved.relativePath).toBe('archive/Story.md')
    expect(moved.path).toBe('C:\\Docs\\archive\\Story.md')
    expect(moved.content).toBe('Unsaved text')
    expect(moved.nativeId).toBe('native-story')
    expect(deps.flushPaneEditorContent).toHaveBeenCalledBefore(files.movePath)
    expect(deps.remapWorkspacePathState).toHaveBeenCalledWith(
      'notes\\Story.md',
      'archive\\Story.md',
    )
    expect(deps.setSelectedPath).toHaveBeenCalledWith('archive\\Story.md')
  })

  it('keeps an immutable print snapshot while pending and allows another native print', () => {
    const { controller, model } = harness()
    controller.preparePrint()
    expect(controller.printPending.value).toBe(true)
    model.applyDocumentUpdate(model.initialDocument.id, 0, 'Later text')
    controller.preparePrint()
    expect(controller.printSnapshot.value?.content).toBe('Original text')
    controller.printPending.value = false
    controller.preparePrint()
    expect(controller.printSnapshot.value).toMatchObject({ content: 'Later text' })
  })

  it('owns local find state and stops refreshing it after disposal', async () => {
    const { controller, panes } = harness()
    controller.findOpen.value = true
    controller.findQuery.value = 'text'
    await nextTick()
    expect(controller.findCount.value).toBe(3)
    controller.nextFind(-1)
    expect(controller.findIndex.value).toBe(2)
    const search = vi.mocked(panes.paneEditors.value.left!.search!)
    search.mockClear()
    controller.dispose()
    controller.findQuery.value = 'after disposal'
    await nextTick()
    expect(search).not.toHaveBeenCalled()
  })
})
