import { describe, expect, it } from 'vitest'
import {
  createDocumentHistoryState,
  recordDocumentPatchHistory,
  recordDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
} from '../../../../src/domain/documents/documentHistory'

describe('document history', () => {
  it('stores reversible patches instead of document snapshots', () => {
    const history = recordDocumentHistory(createDocumentHistoryState(), 'first', 'second')
    const entry = history.past[0]

    expect(entry.forward).toEqual([{ from: 0, to: 5, insert: 'second', removed: 'first' }])
    expect(entry).not.toHaveProperty('content')
    expect(undoDocumentHistory(history, 'second')?.nextContent).toBe('first')
  })

  it('coalesces nearby edits from one editor group into one undo step', () => {
    const first = recordDocumentHistory(createDocumentHistoryState(), '', 'a', 'source', 100)
    const second = recordDocumentHistory(first, 'a', 'ab', 'source', 500)
    const undone = undoDocumentHistory(second, 'ab')

    expect(second.past).toHaveLength(1)
    expect(undone?.nextContent).toBe('')
  })

  it('separates editor groups and clears redo after a fresh edit', () => {
    const first = recordDocumentHistory(createDocumentHistoryState(), 'a', 'ab', 'source', 100)
    const second = recordDocumentHistory(first, 'ab', 'abc', 'visual', 200)
    const undone = undoDocumentHistory(second, 'abc')!
    const fresh = recordDocumentHistory(undone.history, 'ab', 'AB', 'source', 300)

    expect(second.past).toHaveLength(2)
    expect(fresh.future).toEqual([])
  })

  it('redoes the exact patch sequence after undo', () => {
    const history = recordDocumentHistory(createDocumentHistoryState(), 'first', 'second')
    const undone = undoDocumentHistory(history, 'second')!
    const redone = redoDocumentHistory(undone.history, 'first')

    expect(redone?.nextContent).toBe('second')
    expect(redone?.history.future).toEqual([])
  })

  it('stores and reverses exact multi-patch editor transactions', () => {
    const history = recordDocumentPatchHistory(createDocumentHistoryState(), [
      { from: 0, to: 1, insert: 'A', removed: 'a' },
      { from: 3, to: 4, insert: 'D', removed: 'd' },
    ])

    expect(undoDocumentHistory(history, 'AbcD')?.nextContent).toBe('abcd')
  })
})
