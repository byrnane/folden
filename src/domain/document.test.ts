import { describe, expect, it } from 'vitest'
import {
  createDocumentRevision,
  createFileFingerprint,
  INITIAL_DOCUMENT_REVISION,
  isDocumentDirty,
  markRevisionPersisted,
  nextDocumentRevision,
} from './document'

describe('document domain', () => {
  it('increments document revisions from the normalized baseline', () => {
    expect(INITIAL_DOCUMENT_REVISION).toBe(0)
    expect(nextDocumentRevision(INITIAL_DOCUMENT_REVISION)).toBe(1)
    expect(nextDocumentRevision(createDocumentRevision(-12))).toBe(1)
  })

  it('tracks dirty state by revision instead of saved content copies', () => {
    expect(
      isDocumentDirty({
        revision: 3,
        persistedRevision: 2,
      }),
    ).toBe(true)

    expect(markRevisionPersisted(4)).toEqual({
      revision: 4,
      persistedRevision: 4,
    })

    expect(
      isDocumentDirty({
        revision: 4,
        persistedRevision: 4,
      }),
    ).toBe(false)
  })

  it('normalizes file fingerprints for later save and conflict checks', () => {
    expect(createFileFingerprint(128.8, -42)).toEqual({
      size: 128,
      modifiedAtMs: 0,
    })
  })
})
