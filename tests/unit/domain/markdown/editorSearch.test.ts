import { describe, expect, it } from 'vitest'
import { findTextMatches } from '../../../../src/domain/markdown/editorSearch'

describe('literal editor search', () => {
  it('preserves exact offsets and escapes query syntax', () => {
    expect(findTextMatches('ONE one One', 'one')).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ])
    expect(findTextMatches('ONE one One', 'one', true)).toEqual([{ from: 4, to: 7 }])
    expect(findTextMatches('x [a.*] x', '[a.*]')).toEqual([{ from: 2, to: 7 }])
    expect(findTextMatches('İ i', 'i')).toEqual([{ from: 2, to: 3 }])
    expect(findTextMatches('text', '')).toEqual([])
    expect(findTextMatches('aaaa', 'aa')).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ])
  })
})
