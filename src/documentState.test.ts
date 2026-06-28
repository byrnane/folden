import { describe, expect, it } from 'vitest'
import { createDocumentState } from './documentState'

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

    const first = state.openLoadedDocument({
      id: 'document-1',
      path: 'C:\\Docs\\Draft.md',
      content: '# Draft',
      workspaceId: 'workspace-1',
      relativePath: 'Draft.md',
    })
    const second = state.openLoadedDocument({
      id: 'document-2',
      path: 'c:/docs/draft.md',
      content: '# Draft changed elsewhere',
      workspaceId: 'workspace-1',
      relativePath: 'Draft.md',
    })

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

    state.markDocumentSaved(document.id, {
      id: 'document-9',
      path: 'C:\\Docs\\Updated.md',
      content: '# Updated\n',
      workspaceId: null,
      relativePath: null,
    })

    expect(document.path).toBe('C:\\Docs\\Updated.md')
    expect(document.nativeId).toBe('document-9')
    expect(document.persistedRevision).toBe(1)
    expect(state.dirtyDocuments.value).toHaveLength(0)
  })

  it('updates renamed document paths across descendants', () => {
    const state = createState()
    const root = state.openLoadedDocument({
      id: 'document-a',
      path: 'C:\\Docs\\folder\\note.md',
      content: 'A',
      workspaceId: 'workspace-1',
      relativePath: 'folder\\note.md',
    })
    const child = state.openLoadedDocument({
      id: 'document-b',
      path: 'C:\\Docs\\folder\\nested\\deep.md',
      content: 'B',
      workspaceId: 'workspace-1',
      relativePath: 'folder\\nested\\deep.md',
    })

    state.updateDocumentPaths('folder', 'archive')

    expect(root.relativePath).toBe('archive\\note.md')
    expect(child.relativePath).toBe('archive\\nested\\deep.md')
  })
})
