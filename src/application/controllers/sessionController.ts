import { readonly, ref } from 'vue'
import type { OpenDocument } from '../../domain/documents/documentState'
import type { EditorPane, Workspace } from '../types/shell'
import {
  buildSessionDocumentKey,
  MAX_RECOVERY_ENTRIES,
  pruneRecoverySnapshots,
  type PersistedSessionState,
  type RecoverySnapshot,
  type SessionDocumentKind,
  type SessionPaneId,
} from '../sessionRecovery'

const sessionPersistenceDebounceMs = 250

export function createSessionController(hasNativeRuntime: boolean) {
  const pendingRecoveryEntries = ref<RecoverySnapshot[]>([])
  let restoreComplete = false
  let persistTimeout: ReturnType<typeof globalThis.setTimeout> | null = null
  let persistRunning = false
  let persistRequested = false

  function isRestoreComplete() {
    return restoreComplete
  }

  function markRestoreComplete() {
    restoreComplete = true
  }

  function setPendingRecoveryEntries(entries: RecoverySnapshot[]) {
    pendingRecoveryEntries.value = entries
  }

  function removePendingRecoveryEntry(key: string) {
    pendingRecoveryEntries.value = pendingRecoveryEntries.value.filter((entry) => entry.key !== key)
  }

  function discardPendingRecoveryEntries(keys: Set<string>) {
    pendingRecoveryEntries.value = pendingRecoveryEntries.value.filter(
      (entry) => !keys.has(entry.key),
    )
  }

  function documentWorkspaceRootPath(
    document: OpenDocument,
    workspace: Pick<Workspace, 'id' | 'rootPath'> | null,
  ) {
    if (document.workspaceId && workspace?.id === document.workspaceId) {
      return workspace.rootPath
    }

    return null
  }

  function sessionDocumentKind(document: Pick<OpenDocument, 'path'>): SessionDocumentKind {
    return document.path ? 'saved' : 'scratch'
  }

  function buildPersistedSessionState(input: {
    documents: OpenDocument[]
    workspace: Pick<Workspace, 'id' | 'rootPath'> | null
    splitEnabled: boolean
    activePaneId: SessionPaneId
    panes: EditorPane[]
    paneDocumentModes: Record<string, OpenDocument['defaultMode']>
    normalizePath: (path: string) => string
    getDocument: (documentId: string) => OpenDocument | null
  }): PersistedSessionState {
    const documentRecords: PersistedSessionState['documents'] = input.documents.map((document) => ({
      key: buildSessionDocumentKey(document, input.normalizePath),
      kind: sessionDocumentKind(document),
      path: document.path,
      workspaceRootPath: documentWorkspaceRootPath(document, input.workspace),
      relativePath: document.relativePath,
      name: document.name,
    }))
    const paneModeEntries = Object.entries(input.paneDocumentModes)
      .map(([key, mode]) => {
        const [paneId, documentId] = key.split(':', 2) as [SessionPaneId, string]
        const document = input.getDocument(documentId)

        if (!document) {
          return null
        }

        return {
          paneId,
          documentKey: buildSessionDocumentKey(document, input.normalizePath),
          mode,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    return {
      workspaceRootPath: input.workspace?.rootPath ?? null,
      splitEnabled: input.splitEnabled,
      activePaneId: input.activePaneId,
      panes: input.panes.map((pane) => ({
        id: pane.id,
        documentKeys: pane.documentIds
          .map((documentId) => input.getDocument(documentId))
          .filter((document): document is OpenDocument => document !== null)
          .map((document) => buildSessionDocumentKey(document, input.normalizePath)),
        activeDocumentKey: pane.activeDocumentId
          ? (() => {
              const activeDocumentRecord = input.getDocument(pane.activeDocumentId)
              return activeDocumentRecord
                ? buildSessionDocumentKey(activeDocumentRecord, input.normalizePath)
                : null
            })()
          : null,
      })),
      documents: documentRecords,
      paneModes: paneModeEntries,
    }
  }

  function buildCurrentRecoverySnapshots(input: {
    documents: OpenDocument[]
    workspace: Pick<Workspace, 'id' | 'rootPath'> | null
    isDirty: (document: OpenDocument) => boolean
    normalizePath: (path: string) => string
    now?: () => number
  }) {
    const now = input.now ?? Date.now
    return input.documents
      .filter((document) => input.isDirty(document))
      .map(
        (document) =>
          ({
            key: buildSessionDocumentKey(document, input.normalizePath),
            kind: sessionDocumentKind(document),
            path: document.path,
            workspaceRootPath: documentWorkspaceRootPath(document, input.workspace),
            relativePath: document.relativePath,
            name: document.name,
            content: document.content,
            fileFormat: document.fileFormat,
            fingerprint: document.diskFingerprint,
            updatedAtMs: now(),
          }) satisfies RecoverySnapshot,
      )
  }

  function buildPersistedRecoverySnapshots(input: {
    documents: OpenDocument[]
    workspace: Pick<Workspace, 'id' | 'rootPath'> | null
    isDirty: (document: OpenDocument) => boolean
    normalizePath: (path: string) => string
    excludedKeys?: Set<string>
  }) {
    const excludedKeys = input.excludedKeys ?? new Set<string>()
    const currentEntries = buildCurrentRecoverySnapshots(input).filter(
      (entry) => !excludedKeys.has(entry.key),
    )
    const currentKeys = new Set(currentEntries.map((entry) => entry.key))
    const pendingEntries = pendingRecoveryEntries.value.filter(
      (entry) => !excludedKeys.has(entry.key) && !currentKeys.has(entry.key),
    )

    return [...currentEntries, ...pruneRecoverySnapshots(pendingEntries, MAX_RECOVERY_ENTRIES)]
  }

  async function persistSessionAndRecoveryState(persist: () => Promise<void>) {
    if (!hasNativeRuntime || !restoreComplete) {
      return
    }

    if (persistRunning) {
      persistRequested = true
      return
    }

    persistRunning = true

    try {
      await persist()
    } finally {
      persistRunning = false

      if (persistRequested) {
        persistRequested = false
        void persistSessionAndRecoveryState(persist)
      }
    }
  }

  function scheduleSessionPersistence(persist: () => Promise<void>) {
    if (!hasNativeRuntime || !restoreComplete) {
      return
    }

    if (persistTimeout !== null) {
      globalThis.clearTimeout(persistTimeout)
    }

    persistTimeout = globalThis.setTimeout(() => {
      persistTimeout = null
      void persistSessionAndRecoveryState(persist)
    }, sessionPersistenceDebounceMs)
  }

  function dispose() {
    if (persistTimeout !== null) {
      globalThis.clearTimeout(persistTimeout)
      persistTimeout = null
    }
  }

  return {
    pendingRecoveryEntries: readonly(pendingRecoveryEntries),
    isRestoreComplete,
    markRestoreComplete,
    setPendingRecoveryEntries,
    removePendingRecoveryEntry,
    discardPendingRecoveryEntries,
    buildPersistedSessionState,
    buildCurrentRecoverySnapshots,
    buildPersistedRecoverySnapshots,
    persistSessionAndRecoveryState,
    scheduleSessionPersistence,
    dispose,
  }
}
