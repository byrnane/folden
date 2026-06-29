import { describe, expect, it } from 'vitest'
import {
  applicationSettingsStorageKey,
  defaultApplicationSettings,
  loadApplicationSettings,
  normalizeApplicationSettings,
  saveApplicationSettings,
} from './settings'

describe('application settings', () => {
  it('falls back to conservative defaults for malformed settings', () => {
    expect(normalizeApplicationSettings(null)).toEqual(defaultApplicationSettings)
    expect(normalizeApplicationSettings({
      autosave: {
        enabled: true,
        debounceMs: 10,
      },
      remoteImages: {
        policy: 'always-load',
      },
      workspace: {
        ignoredNames: ['.git', 42, ''],
      },
    })).toEqual({
      autosave: {
        enabled: true,
        debounceMs: defaultApplicationSettings.autosave.debounceMs,
      },
      remoteImages: {
        policy: 'blocked',
      },
      workspace: {
        ignoredNames: ['.git'],
      },
    })
  })

  it('loads defaults when persisted JSON is invalid', () => {
    const storage = {
      getItem: () => '{',
    }

    expect(loadApplicationSettings(storage)).toEqual(defaultApplicationSettings)
  })

  it('persists settings without document content', () => {
    let persistedValue = ''
    const storage = {
      setItem: (key: string, value: string) => {
        expect(key).toBe(applicationSettingsStorageKey)
        persistedValue = value
      },
    }

    saveApplicationSettings({
      ...defaultApplicationSettings,
      autosave: {
        enabled: true,
        debounceMs: 1500,
      },
    }, storage)

    expect(persistedValue).toContain('"autosave"')
    expect(persistedValue).not.toContain('content')
  })
})
