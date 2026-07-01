import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { NativePorts } from '../../application/ports/nativePorts'
import {
  closeNativeDocuments,
  createDirectory,
  createFile,
  exportDiagnostics,
  listDirectory,
  loadRecoverySnapshots,
  loadSessionState,
  logFrontendEvent,
  openLogsFolder,
  openTextFile,
  openTextFileAtPath,
  openTextFileByPath,
  openWorkspaceDirectory,
  renamePath,
  restoreWorkspaceByPath,
  saveRecoverySnapshots,
  saveSessionState,
  saveTextFile,
  trashPath,
} from './files'

export function createTauriNativePorts(): NativePorts {
  return {
    documents: {
      closeNativeDocuments,
      openTextFile,
      openTextFileAtPath,
      openTextFileByPath,
      saveTextFile,
    },
    workspace: {
      createDirectory,
      createFile,
      listDirectory,
      openTextFileByPath,
      openWorkspaceDirectory,
      renamePath,
      restoreWorkspaceByPath,
      trashPath,
    },
    sessionStorage: {
      loadRecoverySnapshots,
      loadSessionState,
      saveRecoverySnapshots,
      saveSessionState,
    },
    diagnostics: {
      exportDiagnostics,
      logFrontendEvent,
      openLogsFolder,
    },
    events: {
      getCurrentWindow,
      listen,
    },
  }
}
