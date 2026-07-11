import { ref, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createApplicationCommandController } from '../../../../src/application/controllers/applicationCommandController'

function keyboardEvent(init: Partial<KeyboardEvent> & { code: string }) {
  return {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...init,
  } as unknown as KeyboardEvent
}

function controllerDeps(
  overrides: Partial<Parameters<typeof createApplicationCommandController>[0]> = {},
) {
  return {
    hasNativeRuntime: true,
    isFileBusy: ref(false),
    workspace: shallowRef(null),
    splitEnabled: ref(false),
    activeDocument: shallowRef(null),
    canSaveActiveDocument: vi.fn(() => true),
    canUndoActiveDocument: vi.fn(() => true),
    canRedoActiveDocument: vi.fn(() => false),
    saveDocument: vi.fn(async () => {}),
    runDocumentUndo: vi.fn(),
    runDocumentRedo: vi.fn(),
    openWorkspace: vi.fn(async () => {}),
    openNativeDocument: vi.fn(async () => {}),
    createScratchDocument: vi.fn(),
    createWorkspaceFile: vi.fn(async () => {}),
    createWorkspaceDirectory: vi.fn(async () => {}),
    openLogsFolder: vi.fn(async () => {}),
    exportDiagnosticReport: vi.fn(async () => {}),
    setSplitEnabled: vi.fn(),
    moveActiveDocumentToRight: vi.fn(),
    ...overrides,
  }
}

describe('application command controller', () => {
  it('wires global shortcuts to document commands and respects command availability', () => {
    const deps = controllerDeps()
    const controller = createApplicationCommandController(deps)
    const saveEvent = keyboardEvent({ code: 'KeyS', ctrlKey: true })
    const redoEvent = keyboardEvent({ code: 'KeyY', ctrlKey: true })

    controller.handleGlobalKeydown(saveEvent)
    controller.handleGlobalKeydown(redoEvent)

    expect(deps.saveDocument).toHaveBeenCalledOnce()
    expect(saveEvent.preventDefault).toHaveBeenCalledOnce()
    expect(deps.runDocumentRedo).not.toHaveBeenCalled()
    expect(redoEvent.preventDefault).not.toHaveBeenCalled()
    expect(controller.canExecuteCommand('document.redo')).toBe(false)
  })

  it('gates workspace, native-only, and active-document commands from current state', () => {
    const deps = controllerDeps({
      hasNativeRuntime: false,
      isFileBusy: ref(true),
      workspace: shallowRef(null),
      activeDocument: shallowRef(null),
    })
    const controller = createApplicationCommandController(deps)

    expect(controller.canExecuteCommand('workspace.open')).toBe(false)
    expect(controller.canExecuteCommand('workspace.createFile')).toBe(false)
    expect(controller.canExecuteCommand('logs.open')).toBe(false)
    expect(controller.canExecuteCommand('layout.moveViewRight')).toBe(false)

    controller.executeCommand('workspace.open')
    controller.executeCommand('logs.open')

    expect(deps.openWorkspace).not.toHaveBeenCalled()
    expect(deps.openLogsFolder).not.toHaveBeenCalled()
  })

  it('toggles split state and moves an active document through layout commands', () => {
    const deps = controllerDeps({
      splitEnabled: ref(true),
      activeDocument: shallowRef({ id: 'document-1' }),
    })
    const controller = createApplicationCommandController(deps)

    controller.executeCommand('layout.toggleSplit')
    controller.executeCommand('layout.moveViewRight')

    expect(deps.setSplitEnabled).toHaveBeenCalledWith(false)
    expect(deps.moveActiveDocumentToRight).toHaveBeenCalledOnce()
  })
})
