import { describe, expect, it } from 'vitest'
import { createPaneController } from '../../../../src/application/controllers/paneController'
import { createTextFileFormat } from '../../../../src/domain/document'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'
import { createDocumentPatch } from '../../../../src/domain/documents/documentPatch'

function createDocument(id: string, content = 'content'): OpenDocument {
  return {
    id,
    nativeId: null,
    path: `${id}.md`,
    workspaceId: null,
    relativePath: null,
    name: `${id}.md`,
    content,
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
  }
}

describe('pane controller', () => {
  it('splits, moves tabs, and collapses right pane back into left', () => {
    const first = createDocument('first')
    const second = createDocument('second')
    const controller = createPaneController(first)

    controller.addDocumentToPane(second, 'left')
    controller.moveDocumentToPane(second, 'left', 'right')

    expect(controller.splitEnabled.value).toBe(true)
    expect(controller.getPane('left')?.documentIds).toEqual(['first'])
    expect(controller.getPane('right')?.documentIds).toEqual(['second'])

    controller.setSplitEnabled(false)

    expect(controller.splitEnabled.value).toBe(false)
    expect(controller.getPane('left')?.documentIds).toEqual(['first', 'second'])
    expect(controller.getPane('right')?.documentIds).toEqual([])
    expect(controller.activePaneId.value).toBe('left')
  })

  it('stores per-pane modes and removes orphaned documents from all pane state', () => {
    const first = createDocument('first')
    const controller = createPaneController(first)

    controller.setDocumentMode('left', first, 'source')
    expect(controller.getDocumentMode(controller.getPane('left')!, first)).toBe('source')

    const result = controller.removeDocumentFromPane('left', first.id)

    expect(result.removedDocumentIds).toEqual([first.id])
    expect(controller.getPane('left')?.documentIds).toEqual([])
    expect(controller.paneDocumentModes.value).toEqual({})
    expect(controller.viewSessions.value).toEqual({})
  })

  it('reorders tabs inside a pane and moves tab ids across panes', () => {
    const first = createDocument('first')
    const second = createDocument('second')
    const third = createDocument('third')
    const controller = createPaneController(first)

    controller.addDocumentToPane(second, 'left')
    controller.addDocumentToPane(third, 'left')
    controller.reorderDocumentInPane('left', first.id, 2)

    expect(controller.getPane('left')?.documentIds).toEqual(['second', 'third', 'first'])
    expect(controller.activePaneId.value).toBe('left')
    expect(controller.getPane('left')?.activeDocumentId).toBe(first.id)

    controller.moveDocumentIdToPane(first.id, 'left', 'right', 0)

    expect(controller.splitEnabled.value).toBe(true)
    expect(controller.getPane('left')?.documentIds).toEqual(['second', 'third'])
    expect(controller.getPane('right')?.documentIds).toEqual(['first'])
    expect(controller.activePaneId.value).toBe('right')
  })

  it('enables split when a document is opened directly in the right pane', () => {
    const first = createDocument('first')
    const second = createDocument('second')
    const controller = createPaneController(first)

    controller.addDocumentToPane(second, 'right')

    expect(controller.splitEnabled.value).toBe(true)
    expect(controller.getPane('right')?.documentIds).toEqual(['second'])
    expect(controller.activePaneId.value).toBe('right')
  })

  it('restores layout, modes, split state, and editor sessions from a snapshot', () => {
    const first = createDocument('first')
    const second = createDocument('second')
    const controller = createPaneController(first)
    const documents = new Map([
      [first.id, first],
      [second.id, second],
    ])

    const restoredIds = controller.restoreLayout(
      [
        { id: 'left', documentIds: [first.id], activeDocumentId: first.id },
        { id: 'right', documentIds: [second.id], activeDocumentId: second.id },
      ],
      { [`right:${second.id}`]: 'source' },
      true,
      'right',
      (documentId) => documents.get(documentId) ?? null,
    )

    expect([...restoredIds]).toEqual([first.id, second.id])
    expect(controller.splitEnabled.value).toBe(true)
    expect(controller.activePaneId.value).toBe('right')
    expect(controller.getDocumentMode(controller.getPane('right')!, second)).toBe('source')
    expect(
      Object.values(controller.viewSessions.value)
        .map((session) => session.documentId)
        .sort(),
    ).toEqual([first.id, second.id])
  })

  it('applies accepted document updates to synchronized sessions', () => {
    const document = createDocument('doc', 'before')
    const controller = createPaneController(document)
    controller.setSplitEnabled(true)
    controller.addDocumentToPane(document, 'right')
    const leftSession = controller.getViewSessionId(controller.getPane('left')!, document)

    const updated = controller.applyDocumentUpdateToSessions(
      {
        documentId: document.id,
        originViewId: leftSession,
        baseRevision: 0,
        patches: [createDocumentPatch('before', 'after')!],
        updateKind: 'source-edit',
      },
      document,
      (_documentId, _baseRevision, nextContent) => {
        document.content = nextContent
        document.revision = 1
        return document
      },
    )

    expect(updated?.content).toBe('after')
    expect(
      Object.values(controller.viewSessions.value).every(
        (session) => session.lastAppliedRevision === 1,
      ),
    ).toBe(true)
  })
})
