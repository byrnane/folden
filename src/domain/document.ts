export type DocumentId = string
export type DocumentRevision = number

export type FileFingerprint = {
  size: number
  modifiedAtMs: number
}

export type LineEnding = 'lf' | 'crlf'

export type TextFileFormat = {
  lineEnding: LineEnding
  hasUtf8Bom: boolean
}

export type DirtyState = {
  revision: DocumentRevision
  persistedRevision: DocumentRevision
}

export const INITIAL_DOCUMENT_REVISION = 0

export function createDocumentRevision(value = INITIAL_DOCUMENT_REVISION): DocumentRevision {
  return Math.max(INITIAL_DOCUMENT_REVISION, Math.trunc(value))
}

export function nextDocumentRevision(revision: DocumentRevision): DocumentRevision {
  return createDocumentRevision(revision) + 1
}

export function isDocumentDirty(state: DirtyState): boolean {
  return state.revision !== state.persistedRevision
}

export function createTextFileFormat(
  lineEnding: LineEnding = 'lf',
  hasUtf8Bom = false,
): TextFileFormat {
  return {
    lineEnding,
    hasUtf8Bom,
  }
}
