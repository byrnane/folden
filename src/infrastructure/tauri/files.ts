import { invoke } from '@tauri-apps/api/core'
import type { FileFingerprint, TextFileFormat } from '../../domain/document'
import type {
  OpenedDocument,
  PersistedSessionState,
  RecoveryLoadResult,
  RecoverySnapshot,
  SaveDocumentResult,
  WorkspaceDescriptor,
  WorkspaceEntry,
  WorkspaceSettings,
  WorkspaceSearchRequest,
  WorkspaceSearchResult,
  WorkspaceScanRequest,
  WorkspaceFilesResult,
} from '../../domain/native'
import { createNativeError, isNativeError, type NativeError } from '../../domain/nativeError'

function normalizeNativeError(error: unknown): NativeError {
  if (isNativeError(error)) {
    return createNativeError(error)
  }

  throw error
}

export async function invokeNative<T>(command: string, payload?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, payload)
  } catch (error) {
    throw normalizeNativeError(error)
  }
}

export async function openTextFile() {
  return invokeNative<OpenedDocument | null>('open_text_file')
}

export async function openTextFileAtPath(path: string) {
  return invokeNative<OpenedDocument>('open_text_file_at_path', {
    path,
  })
}

export async function saveTextFile(
  documentId: string | null,
  content: string,
  expectedFingerprint: FileFingerprint | null,
  fileFormat: TextFileFormat,
  suggestedFileName?: string,
) {
  return invokeNative<SaveDocumentResult | null>('save_text_file', {
    documentId,
    content,
    expectedFingerprint,
    fileFormat,
    suggestedFileName,
  })
}

export async function openWorkspaceDirectory() {
  return invokeNative<WorkspaceDescriptor | null>('open_workspace_directory')
}

export async function restoreWorkspaceByPath(rootPath: string) {
  return invokeNative<WorkspaceDescriptor>('restore_workspace_by_path', {
    rootPath,
  })
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

export async function listDirectory(workspaceId: string, path: string) {
  return invokeNative<WorkspaceEntry[]>('list_directory', {
    workspaceId,
    path,
  })
}

export async function syncWorkspaceWatchScope(workspaceId: string | null, loadedPaths: string[]) {
  return invokeNative<void>('sync_workspace_watch_scope', { workspaceId, loadedPaths })
}

export function startWorkspaceSearch(request: WorkspaceSearchRequest) {
  return invokeNative<WorkspaceSearchResult>('start_workspace_search', { request })
}

export function listWorkspaceFiles(request: WorkspaceScanRequest) {
  return invokeNative<WorkspaceFilesResult>('list_workspace_files', { request })
}

export function cancelWorkspaceSearch(workspaceId: string, requestId: string) {
  return invokeNative<void>('cancel_workspace_search', { workspaceId, requestId })
}

export function movePath(workspaceId: string, path: string, targetParent: string) {
  return invokeNative<string>('move_path', { workspaceId, path, targetParent })
}

export function importImageFromPicker(documentId: string) {
  return invokeNative<string | null>('import_image_from_picker', { documentId })
}

export function importImageData(documentId: string, bytes: number[], mime: string, name?: string) {
  return invokeNative<string>('import_image_data', { documentId, bytes, mime, name })
}

export async function loadWorkspaceSettings(workspaceId: string) {
  return invokeNative<WorkspaceSettings>('load_workspace_settings', {
    workspaceId,
  })
}

export async function saveWorkspaceSettings(workspaceId: string, settings: WorkspaceSettings) {
  return invokeNative<void>('save_workspace_settings', {
    workspaceId,
    settings,
  })
}

export async function openTextFileByPath(workspaceId: string, path: string) {
  return invokeNative<OpenedDocument>('open_text_file_by_path', {
    workspaceId,
    path,
  })
}

export async function createFile(workspaceId: string, parentPath: string, name: string) {
  return invokeNative<string>('create_file', {
    workspaceId,
    parentPath,
    name,
  })
}

export async function createDirectory(workspaceId: string, parentPath: string, name: string) {
  return invokeNative<string>('create_directory', {
    workspaceId,
    parentPath,
    name,
  })
}

export async function renamePath(workspaceId: string, path: string, newName: string) {
  return invokeNative<string>('rename_path', {
    workspaceId,
    path,
    newName,
  })
}

export async function trashPath(workspaceId: string, path: string) {
  return invokeNative<void>('trash_path', {
    workspaceId,
    path,
  })
}

export async function closeNativeDocuments(documentIds: string[]) {
  return invokeNative<void>('close_native_documents', {
    documentIds,
  })
}

export async function logFrontendEvent(level: 'info' | 'warn' | 'error', message: string) {
  try {
    await invokeNative<void>('log_frontend_event', {
      level,
      message,
    })
  } catch {
    // Logging must stay best-effort and never block the app.
  }
}

export async function openLogsFolder() {
  return invokeNative<void>('open_logs_folder')
}

export async function exportDiagnostics() {
  return invokeNative<string>('export_diagnostics')
}
