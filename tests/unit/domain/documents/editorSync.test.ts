import { describe, expect, it } from 'vitest'
import { acceptDocumentUpdate, createEditorViewSession, getSynchronizedSessionIds } from '../../../../src/domain/documents/editorSync'
import { createTextFileFormat } from '../../../../src/domain/document'
import { createDocumentHistoryState } from '../../../../src/domain/documents/documentHistory'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'

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
    externalState: 'idle',
    externalMessage: null,
    history: createDocumentHistoryState(),
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
