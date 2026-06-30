import { describe, expect, it } from 'vitest'
import { buildConflictDiffRows } from '../../../../src/domain/markdown/conflictDiff'

describe('conflict diff rows', () => {
  it('keeps unchanged lines aligned', () => {
    expect(buildConflictDiffRows('A\nB\n', 'A\nB\n')).toEqual([
      {
        kind: 'unchanged',
        leftLineNumber: 1,
        leftText: 'A',
        rightLineNumber: 1,
        rightText: 'A',
      },
      {
        kind: 'unchanged',
        leftLineNumber: 2,
        leftText: 'B',
        rightLineNumber: 2,
        rightText: 'B',
      },
      {
        kind: 'unchanged',
        leftLineNumber: 3,
        leftText: '',
        rightLineNumber: 3,
        rightText: '',
      },
    ])
  })

  it('marks insertions, removals, and changed rows', () => {
    expect(buildConflictDiffRows('title\nkeep\nold\n', 'title\nnew\nkeep\n')).toEqual([
      {
        kind: 'unchanged',
        leftLineNumber: 1,
        leftText: 'title',
        rightLineNumber: 1,
        rightText: 'title',
      },
      {
        kind: 'added',
        leftLineNumber: null,
        leftText: '',
        rightLineNumber: 2,
        rightText: 'new',
      },
      {
        kind: 'unchanged',
        leftLineNumber: 2,
        leftText: 'keep',
        rightLineNumber: 3,
        rightText: 'keep',
      },
      {
        kind: 'removed',
        leftLineNumber: 3,
        leftText: 'old',
        rightLineNumber: null,
        rightText: '',
      },
      {
        kind: 'unchanged',
        leftLineNumber: 4,
        leftText: '',
        rightLineNumber: 4,
        rightText: '',
      },
    ])
  })

  it('pairs conflicting chunks line by line', () => {
    expect(buildConflictDiffRows('A\nB\nC\n', 'A\nX\nY\n')).toEqual([
      {
        kind: 'unchanged',
        leftLineNumber: 1,
        leftText: 'A',
        rightLineNumber: 1,
        rightText: 'A',
      },
      {
        kind: 'changed',
        leftLineNumber: 2,
        leftText: 'B',
        rightLineNumber: 2,
        rightText: 'X',
      },
      {
        kind: 'changed',
        leftLineNumber: 3,
        leftText: 'C',
        rightLineNumber: 3,
        rightText: 'Y',
      },
      {
        kind: 'unchanged',
        leftLineNumber: 4,
        leftText: '',
        rightLineNumber: 4,
        rightText: '',
      },
    ])
  })
})
