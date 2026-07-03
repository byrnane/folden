import { describe, expect, it } from 'vitest'
import {
  applicationSettingsStorageKey,
  defaultApplicationSettings,
  defaultLayoutSettings,
  loadApplicationSettings,
  normalizeLayoutSettings,
  normalizeApplicationSettings,
  normalizeWorkspaceIgnoredNames,
  saveApplicationSettings,
} from '../../../../src/infrastructure/settings/settings'

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
      ...defaultApplicationSettings,
      autosave: {
        ...defaultApplicationSettings.autosave,
        enabled: true,
        debounceMs: defaultApplicationSettings.autosave.debounceMs,
      },
      remoteImages: {
        policy: 'blocked',
      },
      workspace: {
        ignoredNames: defaultApplicationSettings.workspace.ignoredNames,
      },
    })
  })

  it('normalizes persisted layout state without document ownership', () => {
    expect(normalizeLayoutSettings({
      activeActivitySection: 'settings',
      activityRailMode: 'expanded',
      activityCompactWidth: 900,
      activityExpandedWidth: 900,
      sidebarWidth: 900,
      splitRatio: 0.1,
      focusMode: true,
      documents: ['not-layout'],
    })).toEqual({
      ...defaultLayoutSettings,
      activeActivitySection: 'settings',
      activityRailMode: 'expanded',
      activityCompactWidth: 80,
      activityExpandedWidth: 280,
      sidebarWidth: 520,
      splitRatio: 0.25,
      focusMode: true,
    })
  })

  it('migrates missing activity rail widths to defaults', () => {
    expect(normalizeLayoutSettings({
      activeActivitySection: 'workspace',
      sidebarWidth: 292,
      splitRatio: 0.5,
      focusMode: false,
    })).toEqual(defaultLayoutSettings)
  })

  it('migrates legacy activity rail width without persisting activityWidth', () => {
    expect(normalizeLayoutSettings({
      activityWidth: 132,
      sidebarWidth: 292,
      splitRatio: 0.5,
      focusMode: false,
    })).toEqual({
      ...defaultLayoutSettings,
      activityRailMode: 'expanded',
      activityCompactWidth: 80,
      activityExpandedWidth: 132,
    })
  })

  it('keeps compact and expanded rail widths independent and clamped', () => {
    expect(normalizeLayoutSettings({
      activityRailMode: 'compact',
      activityCompactWidth: 12,
      activityExpandedWidth: 400,
    })).toEqual({
      ...defaultLayoutSettings,
      activityCompactWidth: 36,
      activityExpandedWidth: 280,
    })
  })

  it('retains built-in ignored workspace names while allowing extra entries', () => {
    expect(normalizeWorkspaceIgnoredNames(['custom', '.git', 'build'])).toEqual([
      '.git',
      'node_modules',
      'dist',
      'build',
      'target',
      '.cache',
      'custom',
    ])
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
        ...defaultApplicationSettings.autosave,
        enabled: true,
        debounceMs: 1500,
        saveOnWindowBlur: true,
      },
    }, storage)

    expect(persistedValue).toContain('"autosave"')
    expect(persistedValue).not.toContain('content')
  })
})
