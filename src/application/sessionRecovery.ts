import type { OpenDocument } from '../domain/documents/documentState'
import { isWindowsPath } from './helpers/pathHelpers'
export type {
  PersistedPaneMode,
  PersistedSessionDocument,
  PersistedSessionPane,
  PersistedSessionState,
  RecoveryLoadResult,
  RecoverySnapshot,
  SessionDocumentKind,
  SessionPaneId,
} from '../domain/native'
import type { RecoverySnapshot } from '../domain/native'

export const MAX_RECOVERY_ENTRIES = 64

export function buildSessionDocumentKey(
  document: Pick<OpenDocument, 'id' | 'path'>,
  normalizePath: (path: string) => string,
) {
  if (document.path) {
    const path = normalizePath(document.path)
    // Keep existing Windows session/recovery identities when relative paths change format.
    return `file:${isWindowsPath(document.path) ? path.replaceAll('/', '\\') : path}`
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
