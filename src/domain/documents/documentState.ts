import type { DocumentId, DocumentRevision, FileFingerprint, TextFileFormat } from '../document'
import type { NativeError } from '../nativeError'
import type { DocumentHistoryState } from './documentHistory'

export type EditorMode = 'visual' | 'source'
export type ExternalDocumentState = 'idle' | 'conflict' | 'missing'

export type OpenDocument = {
  id: DocumentId
  nativeId: string | null
  path: string | null
  workspaceId: string | null
  relativePath: string | null
  name: string
  content: string
  revision: DocumentRevision
  persistedRevision: DocumentRevision
  defaultMode: EditorMode
  fileFormat: TextFileFormat
  diskFingerprint: FileFingerprint | null
  saveState: 'idle' | 'queued' | 'saving' | 'error'
  saveError: NativeError | null
  externalState: ExternalDocumentState
  externalMessage: string | null
  history: DocumentHistoryState
}

export type LoadedDocument = {
  id: string
  path: string
  content: string
  workspaceId: string | null
  relativePath: string | null
  fileFormat: TextFileFormat
  fingerprint: FileFingerprint | null
}
