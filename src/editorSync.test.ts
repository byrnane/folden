import { describe, expect, it } from 'vitest'
import { acceptDocumentUpdate, createEditorViewSession, getSynchronizedSessionIds } from './editorSync'
import { createTextFileFormat } from './domain/document'
import type { OpenDocument } from './documentState'

function createDocument(): OpenDocument {
  return {
    id: 'doc-1',
    nativeId: null,
    path: 'C:\\Docs\\draft.md',
    workspaceId: null,
    relativePath: null,
    name: 'draft.md',
    content: 'hello',
    revision: 2,
    persistedRevision: 2,
    defaultMode: 'source',
    fileFormat: createTextFileFormat(),
    diskFingerprint: null,
    saveState: 'idle',
    saveError: null,
  }
}

describe('editor sync', () => {
  it('accepts only updates based on the current document revision', () => {
    const document = createDocument()

    expect(
      acceptDocumentUpdate(document, {
        documentId: document.id,
        originViewId: 'left:doc-1',
        baseRevision: 1,
        nextContent: 'stale',
        updateKind: 'source-edit',
      }),
    ).toBeNull()

    expect(
      acceptDocumentUpdate(document, {
        documentId: document.id,
        originViewId: 'left:doc-1',
        baseRevision: 2,
        nextContent: 'fresh',
        updateKind: 'source-edit',
      }),
    ).toEqual({
      nextRevision: 3,
      nextContent: 'fresh',
    })
  })

  it('routes synchronized updates to other views of the same document but not the origin', () => {
    const document = createDocument()
    const sessions = [
      createEditorViewSession(document, 'left', 'source'),
      createEditorViewSession(document, 'right', 'visual'),
      createEditorViewSession({ ...document, id: 'doc-2' }, 'right', 'source'),
    ]

    expect(getSynchronizedSessionIds(sessions, document.id, 'left:doc-1')).toEqual(['right:doc-1'])
  })
})
