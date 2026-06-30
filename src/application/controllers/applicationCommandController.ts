import type { Ref } from 'vue'
import type { AppCommand } from '../commands'
import { createCommandController } from './commandController'

type CommandControllerDeps = {
  hasNativeRuntime: boolean
  isFileBusy: Ref<boolean>
  workspace: { readonly value: unknown | null }
  splitEnabled: Ref<boolean>
  activeDocument: { readonly value: unknown | null }
  canSaveActiveDocument: () => boolean
  canUndoActiveDocument: () => boolean
  canRedoActiveDocument: () => boolean
  saveDocument: () => Promise<void>
  runDocumentUndo: () => void
  runDocumentRedo: () => void
  openWorkspace: () => Promise<void>
  openNativeDocument: () => Promise<void>
  createScratchDocument: () => void
  createWorkspaceFile: () => Promise<void>
  createWorkspaceDirectory: () => Promise<void>
  openLogsFolder: () => Promise<void>
  exportDiagnosticReport: () => Promise<void>
  setSplitEnabled: (enabled: boolean) => void
  moveActiveDocumentToRight: () => void
}

export function createApplicationCommandController(deps: CommandControllerDeps) {
  return createCommandController([
    {
      id: 'document.save',
      title: 'Save Document',
      shortcuts: [{ code: 'KeyS', mod: true }],
      canExecute: deps.canSaveActiveDocument,
      execute: () => deps.saveDocument(),
    },
    {
      id: 'document.undo',
      title: 'Undo',
      shortcuts: [{ code: 'KeyZ', mod: true }],
      canExecute: deps.canUndoActiveDocument,
      execute: () => deps.runDocumentUndo(),
    },
    {
      id: 'document.redo',
      title: 'Redo',
      shortcuts: [
        { code: 'KeyZ', mod: true, shift: true },
        { code: 'KeyY', mod: true },
      ],
      canExecute: deps.canRedoActiveDocument,
      execute: () => deps.runDocumentRedo(),
    },
    {
      id: 'workspace.open',
      title: 'Open Workspace',
      shortcuts: [{ code: 'KeyO', mod: true, shift: true }],
      canExecute: () => !deps.isFileBusy.value,
      execute: () => deps.openWorkspace(),
    },
    {
      id: 'document.open',
      title: 'Open Document',
      shortcuts: [{ code: 'KeyO', mod: true }],
      canExecute: () => !deps.isFileBusy.value,
      execute: () => deps.openNativeDocument(),
    },
    {
      id: 'document.new',
      title: 'New Scratch Document',
      shortcuts: [{ code: 'KeyN', mod: true }],
      execute: () => deps.createScratchDocument(),
    },
    {
      id: 'workspace.createFile',
      title: 'New File',
      canExecute: () => deps.workspace.value !== null,
      execute: () => deps.createWorkspaceFile(),
    },
    {
      id: 'workspace.createDirectory',
      title: 'New Folder',
      canExecute: () => deps.workspace.value !== null,
      execute: () => deps.createWorkspaceDirectory(),
    },
    {
      id: 'logs.open',
      title: 'Open Logs Folder',
      canExecute: () => deps.hasNativeRuntime,
      execute: () => deps.openLogsFolder(),
    },
    {
      id: 'diagnostics.export',
      title: 'Export Diagnostics',
      canExecute: () => deps.hasNativeRuntime,
      execute: () => deps.exportDiagnosticReport(),
    },
    {
      id: 'layout.toggleSplit',
      title: 'Toggle Split View',
      shortcuts: [{ code: 'Backslash', mod: true }],
      execute: () => deps.setSplitEnabled(!deps.splitEnabled.value),
    },
    {
      id: 'layout.moveViewRight',
      title: 'Move Active Tab Right',
      shortcuts: [{ code: 'ArrowRight', mod: true, shift: true }],
      canExecute: () => deps.activeDocument.value !== null,
      execute: () => deps.moveActiveDocumentToRight(),
    },
  ] satisfies AppCommand[])
}
