export type CommandId =
  | 'document.new'
  | 'document.open'
  | 'document.save'
  | 'document.undo'
  | 'document.redo'
  | 'diagnostics.export'
  | 'logs.open'
  | 'workspace.createDirectory'
  | 'workspace.createFile'
  | 'workspace.open'
  | 'layout.toggleSplit'
  | 'layout.moveViewRight'

export type CommandShortcut = {
  code: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export type AppCommand = {
  id: CommandId
  title: string
  shortcuts?: CommandShortcut[]
  canExecute?: () => boolean
  execute: () => void | Promise<void>
}

export function matchesShortcut(event: KeyboardEvent, shortcut: CommandShortcut) {
  const hasMod = event.ctrlKey || event.metaKey

  return event.code === shortcut.code &&
    Boolean(shortcut.mod) === hasMod &&
    Boolean(shortcut.shift) === event.shiftKey &&
    Boolean(shortcut.alt) === event.altKey
}

export function createCommandRegistry(commands: AppCommand[]) {
  const commandsById = new Map(commands.map((command) => [command.id, command]))
  const orderedCommands = [...commands]

  function canExecute(command: AppCommand) {
    return command.canExecute?.() ?? true
  }

  function execute(commandId: CommandId) {
    const command = commandsById.get(commandId)

    if (!command || !canExecute(command)) {
      return false
    }

    void command.execute()
    return true
  }

  function canExecuteById(commandId: CommandId) {
    const command = commandsById.get(commandId)
    return command ? canExecute(command) : false
  }

  function getCommand(commandId: CommandId) {
    return commandsById.get(commandId) ?? null
  }

  function handleKeyboardEvent(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) {
      return false
    }

    for (const command of orderedCommands) {
      const hasMatchingShortcut = command.shortcuts?.some((shortcut) => matchesShortcut(event, shortcut)) ?? false

      if (!hasMatchingShortcut) {
        continue
      }

      if (!canExecute(command)) {
        return false
      }

      event.preventDefault()
      void command.execute()
      return true
    }

    return false
  }

  return {
    canExecute: canExecuteById,
    execute,
    getCommand,
    handleKeyboardEvent,
  }
}
