import { describe, expect, it } from 'vitest'
import {
  applyDocumentPatch,
  createDocumentPatch,
  invertDocumentPatch,
} from '../../../../src/domain/documents/documentPatch'

describe('document patches', () => {
  it('stores only the changed slice and reverses it', () => {
    const patch = createDocumentPatch('A long original paragraph.', 'A short original paragraph.')!

    expect(patch).toEqual({ from: 2, to: 6, insert: 'short', removed: 'long' })
    expect(applyDocumentPatch('A long original paragraph.', patch)).toBe(
      'A short original paragraph.',
    )
    expect(applyDocumentPatch('A short original paragraph.', invertDocumentPatch(patch))).toBe(
      'A long original paragraph.',
    )
  })

  it('rejects stale patches', () => {
    const patch = createDocumentPatch('before', 'after')!
    expect(applyDocumentPatch('different', patch)).toBeNull()
  })
})
