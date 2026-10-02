import { t } from '../i18n'
import type { Ref } from 'vue'
import type { AppCommand } from '../commands'
import { createCommandController } from './commandController'

type CommandControllerDeps = {
  hasNativeRuntime: boolean
  hasOpenDialog: () => boolean
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
  const controller = createCommandController([
    {
      id: 'document.save',
      get title() {
        return t('Save Document')
      },
      shortcuts: [{ code: 'KeyS', mod: true }],
      canExecute: deps.canSaveActiveDocument,
      execute: () => deps.saveDocument(),
    },
    {
      id: 'document.undo',
      get title() {
        return t('Undo')
      },
      shortcuts: [{ code: 'KeyZ', mod: true }],
      canExecute: deps.canUndoActiveDocument,
      execute: () => deps.runDocumentUndo(),
    },
    {
      id: 'document.redo',
      get title() {
        return t('Redo')
      },
      shortcuts: [
        { code: 'KeyZ', mod: true, shift: true },
        { code: 'KeyY', mod: true },
      ],
      canExecute: deps.canRedoActiveDocument,
      execute: () => deps.runDocumentRedo(),
    },
    {
      id: 'workspace.open',
      get title() {
        return t('Open Workspace')
      },
      shortcuts: [{ code: 'KeyO', mod: true, shift: true }],
      canExecute: () => !deps.isFileBusy.value,
      execute: () => deps.openWorkspace(),
    },
    {
      id: 'document.open',
      get title() {
        return t('Open Document')
      },
      shortcuts: [{ code: 'KeyO', mod: true }],
      canExecute: () => !deps.isFileBusy.value,
      execute: () => deps.openNativeDocument(),
    },
    {
      id: 'document.new',
      get title() {
        return t('New Scratch Document')
      },
      shortcuts: [{ code: 'KeyN', mod: true }],
      execute: () => deps.createScratchDocument(),
    },
    {
      id: 'workspace.createFile',
      get title() {
        return t('New File')
      },
      canExecute: () => deps.workspace.value !== null,
      execute: () => deps.createWorkspaceFile(),
    },
    {
      id: 'workspace.createDirectory',
      get title() {
        return t('New Folder')
      },
      canExecute: () => deps.workspace.value !== null,
      execute: () => deps.createWorkspaceDirectory(),
    },
    {
      id: 'logs.open',
      get title() {
        return t('Open Logs Folder')
      },
      canExecute: () => deps.hasNativeRuntime,
      execute: () => deps.openLogsFolder(),
    },
    {
      id: 'diagnostics.export',
      get title() {
        return t('Export Diagnostics')
      },
      canExecute: () => deps.hasNativeRuntime,
      execute: () => deps.exportDiagnosticReport(),
    },
    {
      id: 'layout.toggleSplit',
      get title() {
        return t('Toggle Split View')
      },
      shortcuts: [{ code: 'Backslash', mod: true }],
      execute: () => deps.setSplitEnabled(!deps.splitEnabled.value),
    },
    {
      id: 'layout.moveViewRight',
      get title() {
        return t('Move Active Tab to Other Pane')
      },
      shortcuts: [{ code: 'ArrowRight', mod: true, shift: true }],
      canExecute: () => deps.activeDocument.value !== null,
      execute: () => deps.moveActiveDocumentToRight(),
    },
  ] satisfies AppCommand[])

  return {
    ...controller,
    handleGlobalKeydown(event: KeyboardEvent) {
      if (!deps.hasOpenDialog()) controller.handleGlobalKeydown(event)
    },
  }
}
