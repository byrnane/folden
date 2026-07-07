import { describe, expect, it } from 'vitest'
import {
  toSourceSelectionState,
  toVisualSelectionState,
} from '../../../../src/domain/documents/editorViewState'

describe('editor view state conversion', () => {
  it('clamps source selection positions', () => {
    expect(toSourceSelectionState({ kind: 'source', anchor: -10, head: 120 }, 40)).toEqual({
      kind: 'source',
      anchor: 0,
      head: 40,
    })
  })

  it('converts visual positions to source offsets', () => {
    expect(toSourceSelectionState({ kind: 'visual', from: 3, to: 8 }, 20)).toEqual({
      kind: 'source',
      anchor: 2,
      head: 7,
    })
  })

  it('converts source offsets to visual positions', () => {
    expect(toVisualSelectionState({ kind: 'source', anchor: 0, head: 12 }, 8)).toEqual({
      kind: 'visual',
      from: 1,
      to: 8,
    })
  })

  it('ignores invalid visual state for empty documents', () => {
    expect(toVisualSelectionState({ kind: 'source', anchor: 0, head: 0 }, 0)).toBeNull()
  })
})
