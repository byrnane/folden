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
      path: 'C:\\Docs\\Draft.md',
      content: '# Draft',
    })
    const second = state.openLoadedDocument({
      path: 'c:/docs/draft.md',
      content: '# Draft changed elsewhere',
    })

    expect(second.id).toBe(first.id)
    expect(state.documents.value).toHaveLength(1)
  })

  it('marks documents dirty through revisions and persists the active revision on save', () => {
    const state = createState()
    const document = state.createScratchDocument('# Untitled\n', 'Untitled.md')

    state.updateDocumentContent(document.id, '# Updated\n')

    expect(document.revision).toBe(1)
    expect(document.persistedRevision).toBe(0)
    expect(state.dirtyDocuments.value.map((item) => item.id)).toEqual([document.id])

    state.markDocumentSaved(document.id, 'C:\\Docs\\Updated.md')

    expect(document.path).toBe('C:\\Docs\\Updated.md')
    expect(document.persistedRevision).toBe(1)
    expect(state.dirtyDocuments.value).toHaveLength(0)
  })

  it('updates renamed document paths across descendants', () => {
    const state = createState()
    const root = state.openLoadedDocument({
      path: 'C:\\Docs\\folder\\note.md',
      content: 'A',
    })
    const child = state.openLoadedDocument({
      path: 'C:\\Docs\\folder\\nested\\deep.md',
      content: 'B',
    })

    state.updateDocumentPaths('C:\\Docs\\folder', 'C:\\Docs\\archive')

    expect(root.path).toBe('C:\\Docs\\archive\\note.md')
    expect(child.path).toBe('C:\\Docs\\archive\\nested\\deep.md')
  })
})
