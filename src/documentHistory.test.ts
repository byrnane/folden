import { describe, expect, it } from 'vitest'
import {
  createDocumentHistoryState,
  recordDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
} from './documentHistory'

describe('document history', () => {
  it('undoes the latest shared document edit and prepares redo', () => {
    const history = recordDocumentHistory(createDocumentHistoryState(), 'first')
    const undone = undoDocumentHistory(history, 'second')

    expect(undone).toEqual({
      nextContent: 'first',
      history: {
        past: [],
        future: [{ content: 'second' }],
      },
    })
  })

  it('clears redo history after a fresh edit', () => {
    const initialHistory = recordDocumentHistory(createDocumentHistoryState(), 'first')
    const undone = undoDocumentHistory(initialHistory, 'second')

    expect(
      recordDocumentHistory(undone!.history, 'first-fixed'),
    ).toEqual({
      past: [{ content: 'first-fixed' }],
      future: [],
    })
  })

  it('redoes the next document snapshot after undo', () => {
    const initialHistory = recordDocumentHistory(createDocumentHistoryState(), 'first')
    const undone = undoDocumentHistory(initialHistory, 'second')
    const redone = redoDocumentHistory(undone!.history, 'first')

    expect(redone).toEqual({
      nextContent: 'second',
      history: {
        past: [{ content: 'first' }],
        future: [],
      },
    })
  })
})
