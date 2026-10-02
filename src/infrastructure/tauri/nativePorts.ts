import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { NativePorts } from '../../application/ports/nativePorts'
import {
  closeNativeDocuments,
  createDirectory,
  createFile,
  exportDiagnostics,
  listDirectory,
  loadWorkspaceSettings,
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
  saveWorkspaceSettings,
  syncWorkspaceWatchScope,
  trashPath,
  startWorkspaceSearch,
  listWorkspaceFiles,
  cancelWorkspaceSearch,
  movePath,
  importImageFromPicker,
  importImageData,
} from './files'

export function createTauriNativePorts(): NativePorts {
  return {
    documents: {
      closeNativeDocuments,
      openTextFile,
      openTextFileAtPath,
      openTextFileByPath,
      saveTextFile,
      importImageFromPicker,
      importImageData,
    },
    workspace: {
      createDirectory,
      createFile,
      listDirectory,
      loadWorkspaceSettings,
      openTextFileByPath,
      openWorkspaceDirectory,
      renamePath,
      restoreWorkspaceByPath,
      saveWorkspaceSettings,
      syncWorkspaceWatchScope,
      trashPath,
      movePath,
      startWorkspaceSearch,
      listWorkspaceFiles,
      cancelWorkspaceSearch,
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
