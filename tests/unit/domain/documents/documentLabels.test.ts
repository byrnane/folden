import { describe, expect, it } from 'vitest'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import { buildDocumentDisplayLabels } from '../../../../src/domain/documents/documentLabels'

function document(id: string, name: string, path: string | null, relativePath: string | null): OpenDocument {
  return {
    id,
    nativeId: id,
    path,
    workspaceId: relativePath ? 'workspace-1' : null,
    relativePath,
    name,
    content: '',
    revision: 0,
    persistedRevision: 0,
    defaultMode: 'visual',
    fileFormat: createTextFileFormat(),
    diskFingerprint: null,
    saveState: 'idle',
    saveError: null,
    externalState: 'idle',
    externalMessage: null,
    history: { past: [], future: [] },
  }
}

describe('document display labels', () => {
  it('keeps unique filenames short', () => {
    const labels = buildDocumentDisplayLabels([
      document('a', 'README.md', 'C:\\Docs\\README.md', 'README.md'),
      document('b', 'Notes.md', 'C:\\Docs\\Notes.md', 'Notes.md'),
    ], (path) => path.replaceAll('\\', '/'))

    expect(labels.a.label).toBe('README.md')
    expect(labels.b.label).toBe('Notes.md')
  })

  it('adds nearest parent segments for duplicate filenames', () => {
    const labels = buildDocumentDisplayLabels([
      document('a', 'Scenario.md', 'C:\\Docs\\folder 1\\Scenario.md', 'folder 1\\Scenario.md'),
      document('b', 'Scenario.md', 'C:\\Docs\\folder 2\\Scenario.md', 'folder 2\\Scenario.md'),
    ], (path) => path.replaceAll('\\', '/'))

    expect(labels.a.label).toBe('folder 1/Scenario.md')
    expect(labels.b.label).toBe('folder 2/Scenario.md')
  })

  it('adds enough shared parent context and falls back to cleaned external paths', () => {
    const labels = buildDocumentDisplayLabels([
      document('a', 'Scenario.md', 'C:\\Docs\\scripts\\folder 1\\Scenario.md', 'scripts\\folder 1\\Scenario.md'),
      document('b', 'Scenario.md', 'C:\\Docs\\scripts\\folder 2\\Scenario.md', 'scripts\\folder 2\\Scenario.md'),
      document('c', 'Scenario.md', 'D:\\External\\Scenario.md', null),
    ], (path) => path.replaceAll('\\', '/'))

    expect(labels.a.label).toBe('folder 1/Scenario.md')
    expect(labels.b.label).toBe('folder 2/Scenario.md')
    expect(labels.c.label).toBe('External/Scenario.md')
  })
})
