import { describe, expect, it } from 'vitest'
import {
  applicationSettingLimits,
  defaultApplicationSettings,
  defaultLayoutSettings,
  layoutSettingLimits,
  normalizeLayoutSettings,
  normalizeApplicationSettings,
  normalizeWorkspaceIgnoredNames,
} from '../../../../src/application/settings'
import {
  applicationSettingsStorageKey,
  loadApplicationSettings,
  loadLayoutSettings,
  saveApplicationSettings,
  saveLayoutSettings,
} from '../../../../src/infrastructure/settings/settings'

describe('application settings', () => {
  it('falls back to conservative defaults for malformed settings', () => {
    expect(normalizeApplicationSettings(null)).toEqual(defaultApplicationSettings)
    expect(normalizeApplicationSettings({
      autosave: {
        enabled: true,
        debounceMs: applicationSettingLimits.autosaveDebounceMs.min - 1,
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
      activityCompactWidth: layoutSettingLimits.activityCompactWidth.max,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.max,
      sidebarWidth: layoutSettingLimits.sidebarWidth.max,
      splitRatio: layoutSettingLimits.splitRatio.min,
      focusMode: true,
    })
  })

  it('migrates missing activity rail widths to defaults', () => {
    expect(normalizeLayoutSettings({
      activeActivitySection: 'workspace',
      sidebarWidth: layoutSettingLimits.sidebarWidth.fallback,
      splitRatio: layoutSettingLimits.splitRatio.fallback,
      focusMode: false,
    })).toEqual(defaultLayoutSettings)
  })

  it('migrates legacy activity rail width without persisting activityWidth', () => {
    expect(normalizeLayoutSettings({
      activityWidth: 132,
      sidebarWidth: layoutSettingLimits.sidebarWidth.fallback,
      splitRatio: layoutSettingLimits.splitRatio.fallback,
      focusMode: false,
    })).toEqual({
      ...defaultLayoutSettings,
      activityRailMode: 'expanded',
      activityCompactWidth: layoutSettingLimits.activityCompactWidth.max,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.min,
    })
  })

  it.each([
    [
      layoutSettingLimits.activityExpandedWidth.min - 1,
      layoutSettingLimits.activityExpandedWidth.min,
      layoutSettingLimits.activityCompactWidth.max,
    ],
    [
      layoutSettingLimits.activityExpandedWidth.min,
      layoutSettingLimits.activityExpandedWidth.min,
      layoutSettingLimits.activityCompactWidth.max,
    ],
    [
      layoutSettingLimits.activityExpandedWidth.max,
      layoutSettingLimits.activityExpandedWidth.max,
      layoutSettingLimits.activityCompactWidth.max,
    ],
    [
      layoutSettingLimits.activityExpandedWidth.max + 1,
      layoutSettingLimits.activityExpandedWidth.max,
      layoutSettingLimits.activityCompactWidth.max,
    ],
  ])(
    'clamps migrated legacy activity width %s to expanded %s',
    (activityWidth, activityExpandedWidth, activityCompactWidth) => {
      expect(normalizeLayoutSettings({
        activityWidth,
      })).toEqual({
        ...defaultLayoutSettings,
        activityRailMode: 'expanded',
        activityCompactWidth,
        activityExpandedWidth,
      })
    },
  )

  it('keeps compact and expanded rail widths independent and clamped', () => {
    expect(normalizeLayoutSettings({
      activityRailMode: 'compact',
      activityCompactWidth: layoutSettingLimits.activityCompactWidth.min - 1,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.max + 1,
    })).toEqual({
      ...defaultLayoutSettings,
      activityCompactWidth: layoutSettingLimits.activityCompactWidth.min,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.max,
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

  it('loads default layout settings when persisted layout JSON is invalid', () => {
    const storage = {
      getItem: () => '{',
    }

    expect(loadLayoutSettings(storage)).toEqual(defaultLayoutSettings)
  })

  it('saves and restores normalized layout settings', () => {
    let persistedValue = ''
    const storage = {
      getItem: () => persistedValue,
      setItem: (_key: string, value: string) => {
        persistedValue = value
      },
    }

    const settings = {
      ...defaultLayoutSettings,
      activityRailMode: 'expanded' as const,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.min,
      sidebarWidth: layoutSettingLimits.sidebarWidth.max,
      splitRatio: layoutSettingLimits.splitRatio.min,
      focusMode: true,
    }

    saveLayoutSettings(settings, storage)

    expect(loadLayoutSettings(storage)).toEqual(settings)
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
        debounceMs: applicationSettingLimits.autosaveDebounceMs.fallback + applicationSettingLimits.autosaveDebounceMs.step,
        saveOnWindowBlur: true,
      },
    }, storage)

    expect(persistedValue).toContain('"autosave"')
    expect(persistedValue).not.toContain('content')
  })
})
