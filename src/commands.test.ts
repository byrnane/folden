import { describe, expect, it, vi } from 'vitest'
import { createCommandRegistry, matchesShortcut } from './commands'

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

describe('command registry', () => {
  it('matches physical shortcut contracts', () => {
    expect(matchesShortcut(keyboardEvent({ code: 'KeyS', ctrlKey: true }), {
      code: 'KeyS',
      mod: true,
    })).toBe(true)
    expect(matchesShortcut(keyboardEvent({ code: 'KeyS', shiftKey: true }), {
      code: 'KeyS',
      mod: true,
    })).toBe(false)
  })

  it('executes enabled commands from shortcuts', () => {
    const execute = vi.fn()
    const event = keyboardEvent({ code: 'KeyS', ctrlKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const registry = createCommandRegistry([{
      id: 'document.save',
      title: 'Save',
      shortcuts: [{ code: 'KeyS', mod: true }],
      execute,
    }])

    expect(registry.handleKeyboardEvent(event)).toBe(true)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
  })

  it('does not execute disabled commands', () => {
    const execute = vi.fn()
    const event = keyboardEvent({ code: 'KeyS', ctrlKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const registry = createCommandRegistry([{
      id: 'document.save',
      title: 'Save',
      shortcuts: [{ code: 'KeyS', mod: true }],
      canExecute: () => false,
      execute,
    }])

    expect(registry.canExecute('document.save')).toBe(false)
    expect(registry.handleKeyboardEvent(event)).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('supports multiple shortcut contracts for one command', () => {
    const execute = vi.fn()
    const registry = createCommandRegistry([{
      id: 'document.redo',
      title: 'Redo',
      shortcuts: [
        { code: 'KeyZ', mod: true, shift: true },
        { code: 'KeyY', mod: true },
      ],
      execute,
    }])

    expect(registry.handleKeyboardEvent(keyboardEvent({ code: 'KeyY', ctrlKey: true }))).toBe(true)
    expect(registry.handleKeyboardEvent(keyboardEvent({ code: 'KeyZ', ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('leaves editor-native shortcuts without app commands untouched', () => {
    const execute = vi.fn()
    const event = keyboardEvent({ code: 'KeyB', ctrlKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const registry = createCommandRegistry([{
      id: 'document.save',
      title: 'Save',
      shortcuts: [{ code: 'KeyS', mod: true }],
      execute,
    }])

    expect(registry.handleKeyboardEvent(event)).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not execute commands after another handler consumed the shortcut', () => {
    const execute = vi.fn()
    const event = keyboardEvent({ code: 'KeyS', ctrlKey: true, defaultPrevented: true })
    const registry = createCommandRegistry([{
      id: 'document.save',
      title: 'Save',
      shortcuts: [{ code: 'KeyS', mod: true }],
      execute,
    }])

    expect(registry.handleKeyboardEvent(event)).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
})
