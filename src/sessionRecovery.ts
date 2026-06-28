import type { FileFingerprint, TextFileFormat } from './domain/document'
import type { EditorMode, OpenDocument } from './documentState'
import { invokeNative, type OpenedDocument } from './tauriFiles'

export type SessionDocumentKind = 'saved' | 'scratch'
export type SessionPaneId = 'left' | 'right'

export type PersistedSessionDocument = {
  key: string
  kind: SessionDocumentKind
  path: string | null
  workspaceRootPath: string | null
  relativePath: string | null
  name: string
}

export type PersistedSessionPane = {
  id: SessionPaneId
  documentKeys: string[]
  activeDocumentKey: string | null
}

export type PersistedPaneMode = {
  paneId: SessionPaneId
  documentKey: string
  mode: EditorMode
}

export type PersistedSessionState = {
  workspaceRootPath: string | null
  splitEnabled: boolean
  activePaneId: SessionPaneId
  panes: PersistedSessionPane[]
  documents: PersistedSessionDocument[]
  paneModes: PersistedPaneMode[]
}

export type RecoverySnapshot = {
  key: string
  kind: SessionDocumentKind
  path: string | null
  workspaceRootPath: string | null
  relativePath: string | null
  name: string
  content: string
  fileFormat: TextFileFormat
  fingerprint: FileFingerprint | null
  updatedAtMs: number
}

export type RecoveryLoadResult = {
  entries: RecoverySnapshot[]
  diagnostics: string[]
}

export const MAX_RECOVERY_ENTRIES = 64

export function buildSessionDocumentKey(
  document: Pick<OpenDocument, 'id' | 'path'>,
  normalizePath: (path: string) => string,
) {
  if (document.path) {
    return `file:${normalizePath(document.path)}`
  }

  return `scratch:${document.id}`
}

export function pruneRecoverySnapshots(
  entries: readonly RecoverySnapshot[],
  maxEntries = MAX_RECOVERY_ENTRIES,
) {
  const entriesByKey = new Map<string, RecoverySnapshot>()

  for (const entry of [...entries].sort((left, right) => right.updatedAtMs - left.updatedAtMs)) {
    if (!entriesByKey.has(entry.key)) {
      entriesByKey.set(entry.key, entry)
    }
  }

  return [...entriesByKey.values()].slice(0, maxEntries)
}

export async function loadSessionState() {
  return invokeNative<PersistedSessionState | null>('load_session_state')
}

export async function saveSessionState(session: PersistedSessionState | null) {
  return invokeNative<void>('save_session_state', {
    session,
  })
}

export async function loadRecoverySnapshots() {
  return invokeNative<RecoveryLoadResult>('load_recovery_snapshots')
}

export async function saveRecoverySnapshots(entries: RecoverySnapshot[]) {
  return invokeNative<void>('save_recovery_snapshots', {
    entries,
  })
}

export async function openTextFileAtPath(path: string) {
  return invokeNative<OpenedDocument>('open_text_file_at_path', {
    path,
  })
}
