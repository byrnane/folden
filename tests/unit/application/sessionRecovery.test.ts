import { describe, expect, it } from 'vitest'
import { buildSessionDocumentKey, pruneRecoverySnapshots, type RecoverySnapshot } from '../../../src/application/sessionRecovery'

describe('session recovery helpers', () => {
  it('builds stable keys for saved and scratch documents', () => {
    expect(buildSessionDocumentKey({
      id: 'doc-1',
      path: 'C:/Docs/Note.md',
    }, (path) => path.replaceAll('/', '\\').toLowerCase())).toBe('file:c:\\docs\\note.md')

    expect(buildSessionDocumentKey({
      id: 'scratch-1',
      path: null,
    }, (path) => path)).toBe('scratch:scratch-1')
  })

  it('keeps only the newest recovery snapshot per key and enforces retention bounds', () => {
    const createSnapshot = (key: string, updatedAtMs: number): RecoverySnapshot => ({
      key,
      kind: 'saved',
      path: `C:\\Docs\\${key}.md`,
      workspaceRootPath: 'C:\\Docs',
      relativePath: `${key}.md`,
      name: `${key}.md`,
      content: key,
      fileFormat: {
        lineEnding: 'lf',
        hasUtf8Bom: false,
      },
      fingerprint: null,
      updatedAtMs,
    })

    expect(pruneRecoverySnapshots([
      createSnapshot('a', 1),
      createSnapshot('b', 2),
      createSnapshot('a', 3),
    ], 2)).toEqual([
      createSnapshot('a', 3),
      createSnapshot('b', 2),
    ])
  })
})
