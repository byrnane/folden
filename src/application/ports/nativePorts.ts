import type { FileFingerprint, TextFileFormat } from '../../domain/document'
import type {
  OpenedDocument,
  SaveDocumentResult,
  WorkspaceDescriptor,
  WorkspaceEntry,
  WorkspaceSettings,
} from '../../domain/native'
import type { PersistedSessionState, RecoverySnapshot } from '../sessionRecovery'

export type TauriWindowPort = {
  onCloseRequested: (
    handler: (event: { preventDefault: () => void }) => Promise<void> | void,
  ) => Promise<() => void>
  destroy: () => Promise<void>
}

export type DocumentFilePort = {
  openTextFile: () => Promise<OpenedDocument | null>
  openTextFileByPath: (workspaceId: string, path: string) => Promise<OpenedDocument>
  openTextFileAtPath: (path: string) => Promise<OpenedDocument>
  saveTextFile: (
    documentId: string | null,
    content: string,
    expectedFingerprint: FileFingerprint | null,
    fileFormat: TextFileFormat,
    suggestedFileName?: string,
  ) => Promise<SaveDocumentResult | null>
  closeNativeDocuments: (documentIds: string[]) => Promise<void>
}

export type WorkspaceFilePort = {
  openWorkspaceDirectory: () => Promise<WorkspaceDescriptor | null>
  restoreWorkspaceByPath: (rootPath: string) => Promise<WorkspaceDescriptor>
  listDirectory: (workspaceId: string, path: string) => Promise<WorkspaceEntry[]>
  syncWorkspaceWatchScope: (workspaceId: string | null, loadedPaths: string[]) => Promise<void>
  loadWorkspaceSettings: (workspaceId: string) => Promise<WorkspaceSettings>
  saveWorkspaceSettings: (workspaceId: string, settings: WorkspaceSettings) => Promise<void>
  openTextFileByPath: (workspaceId: string, path: string) => Promise<OpenedDocument>
  createFile: (workspaceId: string, parentPath: string, name: string) => Promise<string>
  createDirectory: (workspaceId: string, parentPath: string, name: string) => Promise<string>
  renamePath: (workspaceId: string, path: string, newName: string) => Promise<string>
  trashPath: (workspaceId: string, path: string) => Promise<void>
}

export type SessionStoragePort = {
  loadSessionState: () => Promise<PersistedSessionState | null>
  saveSessionState: (session: PersistedSessionState | null) => Promise<void>
  loadRecoverySnapshots: () => Promise<{ entries: RecoverySnapshot[]; diagnostics: string[] }>
  saveRecoverySnapshots: (entries: RecoverySnapshot[]) => Promise<void>
}

export type DiagnosticsPort = {
  logFrontendEvent: (level: 'info' | 'warn' | 'error', message: string) => Promise<void>
  openLogsFolder: () => Promise<void>
  exportDiagnostics: () => Promise<string>
}

export type NativeEventPort = {
  listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
  getCurrentWindow: () => TauriWindowPort
}

export type NativePorts = {
  documents: DocumentFilePort
  workspace: WorkspaceFilePort
  sessionStorage: SessionStoragePort
  diagnostics: DiagnosticsPort
  events: NativeEventPort
}
