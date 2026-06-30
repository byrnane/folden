import { createCommandRegistry, type AppCommand, type CommandId } from '../commands'

export function createCommandController(commands: AppCommand[]) {
  const commandRegistry = createCommandRegistry(commands)

  function canExecuteCommand(commandId: CommandId) {
    return commandRegistry.canExecute(commandId)
  }

  function executeCommand(commandId: CommandId) {
    commandRegistry.execute(commandId)
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    commandRegistry.handleKeyboardEvent(event)
  }

  return {
    canExecuteCommand,
    executeCommand,
    handleGlobalKeydown,
  }
}
