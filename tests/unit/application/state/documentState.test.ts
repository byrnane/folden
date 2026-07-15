import { describe, expect, it } from 'vitest'
import { createDocumentState } from '../../../../src/application/state/documentState'
import { createTextFileFormat } from '../../../../src/domain/document'
import { assertMarkdownBlockDocument } from '../../../../src/domain/markdown/blockDocument'

function createLoadedDocument(
  overrides: Partial<Parameters<ReturnType<typeof createState>['openLoadedDocument']>[0]>,
) {
  return {
    id: 'document-default',
    path: 'C:\\Docs\\Draft.md',
    content: '# Draft',
    workspaceId: 'workspace-1',
    relativePath: 'Draft.md',
    fileFormat: createTextFileFormat(),
    fingerprint: {
      size: 12,
      modifiedAtMs: 24,
    },
    ...overrides,
  }
}

function createState() {
  return createDocumentState({
    fileNameFromPath: (path) => path.split(/[\\/]/).at(-1) ?? path,
    isMarkdownPath: (path) => !path || /\.(md|markdown)$/i.test(path),
    normalizePath: (path) => path.replaceAll('/', '\\').toLowerCase(),
  })
}

describe('document state', () => {
  it('reuses one document model for the same file path', () => {
    const state = createState()

    const first = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-1',
        path: 'C:\\Docs\\Draft.md',
      }),
    )
    const second = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-2',
        path: 'c:/docs/draft.md',
        content: '# Draft changed elsewhere',
      }),
    )

    expect(second.id).toBe(first.id)
    expect(first.nativeId).toBe('document-2')
    expect(state.documents.value).toHaveLength(1)
  })

  it('marks documents dirty through revisions and persists the active revision on save', () => {
    const state = createState()
    const document = state.createScratchDocument('# Untitled\n', 'Untitled.md')

    state.updateDocumentContent(document.id, '# Updated\n')

    expect(document.revision).toBe(1)
    expect(document.persistedRevision).toBe(0)
    expect(state.dirtyDocuments.value.map((item) => item.id)).toEqual([document.id])

    state.markDocumentQueued(document.id)
    state.markDocumentSaving(document.id)

    state.markDocumentSaved(document.id, 1, {
      id: 'document-9',
      path: 'C:\\Docs\\Updated.md',
      content: '# Updated\n',
      workspaceId: null,
      relativePath: null,
      fileFormat: {
        lineEnding: 'lf',
        hasUtf8Bom: false,
      },
      fingerprint: {
        size: 10,
        modifiedAtMs: 20,
      },
    })

    expect(document.path).toBe('C:\\Docs\\Updated.md')
    expect(document.nativeId).toBe('document-9')
    expect(document.persistedRevision).toBe(1)
    expect(document.saveState).toBe('idle')
    expect(document.externalState).toBe('idle')
    expect(state.dirtyDocuments.value).toHaveLength(0)
  })

  it('supports shared document undo and redo over the revision stream', () => {
    const state = createState()
    const document = state.createScratchDocument('first', 'Untitled.md')

    state.applyDocumentUpdate(document.id, document.revision, 'second')
    state.applyDocumentUpdate(document.id, document.revision, 'third')

    const undone = state.undoDocument(document.id)

    expect(undone?.content).toBe('second')
    expect(undone?.revision).toBe(3)

    const redone = state.redoDocument(document.id)

    expect(redone?.content).toBe('third')
    expect(redone?.revision).toBe(4)
  })

  it('keeps block history coherent through move, duplicate, delete, undo and redo', () => {
    const state = createState()
    const document = state.createScratchDocument('One\n\nTwo\n\nThree\n', 'History.md')
    const initialIds = document.blockDocument!.blocks.map((block) => block.id)
    const revisions = [
      ['Two\n\nOne\n\nThree\n', 'move'],
      ['Two\n\nOne\n\nOne\n\nThree\n', 'duplicate'],
      ['Two\n\nOne\n\nOne\n', 'delete'],
    ] as const

    for (const [index, [content, group]] of revisions.entries()) {
      state.applyDocumentUpdate(document.id, document.revision, content, group)
      expect(() => assertMarkdownBlockDocument(document.blockDocument!)).not.toThrow()
      expect(new Set(document.blockDocument!.blocks.map((block) => block.id)).size).toBe(
        document.blockDocument!.blocks.length,
      )
      if (index === 0) {
        expect(document.blockDocument!.blocks.map((block) => block.id)).toEqual([
          initialIds[1],
          initialIds[0],
          initialIds[2],
        ])
      }
    }

    expect(state.undoDocument(document.id)?.content).toBe(revisions[1][0])
    expect(state.undoDocument(document.id)?.content).toBe(revisions[0][0])
    expect(state.undoDocument(document.id)?.content).toBe('One\n\nTwo\n\nThree\n')
    expect(document.blockDocument!.blocks.map((block) => block.id)).toEqual(initialIds)

    expect(state.redoDocument(document.id)?.content).toBe(revisions[0][0])
    expect(state.redoDocument(document.id)?.content).toBe(revisions[1][0])
    expect(state.redoDocument(document.id)?.content).toBe(revisions[2][0])
    expect(() => assertMarkdownBlockDocument(document.blockDocument!)).not.toThrow()
  })

  it('updates renamed document paths across descendants', () => {
    const state = createState()
    const root = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-a',
        path: 'C:\\Docs\\folder\\note.md',
        content: 'A',
        workspaceId: 'workspace-1',
        relativePath: 'folder\\note.md',
      }),
    )
    const child = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-b',
        path: 'C:\\Docs\\folder\\nested\\deep.md',
        content: 'B',
        workspaceId: 'workspace-1',
        relativePath: 'folder\\nested\\deep.md',
      }),
    )

    state.updateDocumentPaths('folder', 'archive', 'C:\\Docs')

    expect(root.relativePath).toBe('archive\\note.md')
    expect(root.path).toBe('C:\\Docs\\archive\\note.md')
    expect(child.relativePath).toBe('archive\\nested\\deep.md')
    expect(child.path).toBe('C:\\Docs\\archive\\nested\\deep.md')

    const reopened = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-c',
        path: 'C:\\Docs\\archive\\nested\\deep.md',
        content: 'C',
        workspaceId: 'workspace-1',
        relativePath: 'archive\\nested\\deep.md',
      }),
    )

    expect(reopened.id).toBe(child.id)
    expect(state.documents.value).toHaveLength(2)
  })

  it('replaces a clean document from disk and keeps it non-dirty', () => {
    const state = createState()
    const document = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-clean',
        path: 'C:\\Docs\\Draft.md',
        content: 'before',
      }),
    )

    const reloaded = state.replaceDocumentFromDisk(document.id, {
      id: 'document-clean',
      path: 'C:\\Docs\\Draft.md',
      content: 'after',
      workspaceId: 'workspace-1',
      relativePath: 'Draft.md',
      fileFormat: createTextFileFormat(),
      fingerprint: {
        size: 5,
        modifiedAtMs: 99,
      },
    })

    expect(reloaded?.content).toBe('after')
    expect(reloaded?.revision).toBe(reloaded?.persistedRevision)
    expect(reloaded?.externalState).toBe('idle')
  })

  it('tracks conflict and missing external states explicitly', () => {
    const state = createState()
    const document = state.createScratchDocument('draft', 'Untitled.md')

    state.markDocumentConflict(document.id, 'changed outside Folden')
    expect(document.externalState).toBe('conflict')

    state.markDocumentMissing(document.id, 'file was removed')
    expect(document.externalState).toBe('missing')

    state.clearDocumentExternalState(document.id)
    expect(document.externalState).toBe('idle')
    expect(document.externalMessage).toBeNull()
  })

  it('creates an explicit revision when acknowledging a conflict without changing content', () => {
    const state = createState()
    const document = state.openLoadedDocument(
      createLoadedDocument({
        id: 'document-conflict',
        path: 'C:\\Docs\\Draft.md',
        content: 'draft',
      }),
    )

    state.updateDocumentContent(document.id, 'draft + local')
    state.markDocumentConflict(document.id, 'changed outside Folden')

    const acknowledged = state.acknowledgeDocumentConflict(document.id, {
      size: 99,
      modifiedAtMs: 199,
    })

    expect(acknowledged?.revision).toBe(2)
    expect(acknowledged?.persistedRevision).toBe(0)
    expect(acknowledged?.diskFingerprint).toEqual({
      size: 99,
      modifiedAtMs: 199,
    })
    expect(acknowledged?.externalState).toBe('idle')
  })
})
