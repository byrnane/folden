import { invoke } from '@tauri-apps/api/core'
import type { FileFingerprint, TextFileFormat } from '../../domain/document'

export type WorkspaceDescriptor = {
  id: string
  rootPath: string
  name: string
}

export type WorkspaceEntry = {
  name: string
  path: string
  kind: 'directory' | 'file'
  children: WorkspaceEntry[]
}

export type OpenedDocument = {
  id: string
  path: string
  content: string
  workspaceId: string | null
  relativePath: string | null
  fileFormat: TextFileFormat
  fingerprint: FileFingerprint | null
}

export type NativeError = {
  code: string
  operation: string
  userMessage: string
  technicalMessage: string | null
  retryable: boolean
}

export type SaveDocumentResult = OpenedDocument
export type NativeFsEvent = {
  kind: 'create' | 'modify' | 'remove'
  path: string
}

function normalizeNativeError(error: unknown): NativeError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Partial<NativeError>

    if (
      typeof candidate.code === 'string' &&
      typeof candidate.operation === 'string' &&
      typeof candidate.userMessage === 'string' &&
      typeof candidate.retryable === 'boolean'
    ) {
      return {
        code: candidate.code,
        operation: candidate.operation,
        userMessage: candidate.userMessage,
        technicalMessage: candidate.technicalMessage ?? null,
        retryable: candidate.retryable,
      }
    }
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

export async function listDirectory(workspaceId: string, path: string) {
  return invokeNative<WorkspaceEntry[]>('list_directory', {
    workspaceId,
    path,
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
