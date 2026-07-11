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
    expect(
      normalizeApplicationSettings({
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
      }),
    ).toEqual({
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
    expect(
      normalizeLayoutSettings({
        activeActivitySection: 'settings',
        activityRailMode: 'expanded',
        activityCompactWidth: 900,
        activityExpandedWidth: 900,
        sidebarWidth: 900,
        splitRatio: 0.1,
        focusMode: true,
        documents: ['not-layout'],
      }),
    ).toEqual({
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

  it.each(['workspace', 'search', 'create', 'settings'] as const)(
    'keeps supported activity section %s',
    (activeActivitySection) => {
      expect(normalizeLayoutSettings({ activeActivitySection }).activeActivitySection).toBe(
        activeActivitySection,
      )
    },
  )

  it('falls back to workspace for an unknown activity section', () => {
    expect(
      normalizeLayoutSettings({ activeActivitySection: 'templates' }).activeActivitySection,
    ).toBe('workspace')
  })

  it('defaults document navigation visibility when persisted layout is older', () => {
    expect(
      normalizeLayoutSettings({
        showDocumentOutline: false,
        showDocumentMap: false,
      }),
    ).toEqual({
      ...defaultLayoutSettings,
      showDocumentOutline: false,
      showDocumentMap: false,
    })

    expect(
      normalizeLayoutSettings({
        showDocumentOutline: 'yes',
        showDocumentMap: null,
      }),
    ).toEqual(defaultLayoutSettings)
  })

  it('migrates missing activity rail widths to defaults', () => {
    expect(
      normalizeLayoutSettings({
        activeActivitySection: 'workspace',
        sidebarWidth: layoutSettingLimits.sidebarWidth.fallback,
        splitRatio: layoutSettingLimits.splitRatio.fallback,
        focusMode: false,
      }),
    ).toEqual(defaultLayoutSettings)
  })

  it('keeps compact and expanded rail widths independent and clamped', () => {
    expect(
      normalizeLayoutSettings({
        activityRailMode: 'compact',
        activityCompactWidth: layoutSettingLimits.activityCompactWidth.min - 1,
        activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.max + 1,
      }),
    ).toEqual({
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

  it('loads current persisted layout format', () => {
    const settings = {
      ...defaultLayoutSettings,
      activeActivitySection: 'settings' as const,
      activityRailMode: 'expanded' as const,
      activityCompactWidth: layoutSettingLimits.activityCompactWidth.max,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.min,
      sidebarWidth: layoutSettingLimits.sidebarWidth.max,
      splitRatio: layoutSettingLimits.splitRatio.min,
      focusMode: true,
    }
    const storage = {
      getItem: () => JSON.stringify(settings),
    }

    expect(loadLayoutSettings(storage)).toEqual(settings)
  })

  it('loads legacy persisted activity rail width through infrastructure migration', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          activityWidth: 132,
          sidebarWidth: layoutSettingLimits.sidebarWidth.fallback,
          splitRatio: layoutSettingLimits.splitRatio.fallback,
          focusMode: false,
        }),
    }

    expect(loadLayoutSettings(storage)).toEqual({
      ...defaultLayoutSettings,
      activityRailMode: 'expanded',
      activityCompactWidth: layoutSettingLimits.activityCompactWidth.max,
      activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.min,
    })
  })

  it('derives legacy activity rail mode when persisted mode is invalid', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          activityRailMode: 'wide',
          activityWidth: 132,
        }),
    }

    expect(loadLayoutSettings(storage)).toEqual({
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
    'loads and clamps legacy persisted activity width %s to expanded %s',
    (activityWidth, activityExpandedWidth, activityCompactWidth) => {
      const storage = {
        getItem: () =>
          JSON.stringify({
            activityWidth,
          }),
      }

      expect(loadLayoutSettings(storage)).toEqual({
        ...defaultLayoutSettings,
        activityRailMode: 'expanded',
        activityCompactWidth,
        activityExpandedWidth,
      })
    },
  )

  it('loads partially filled persisted layout state with normalized defaults', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          activeActivitySection: 'settings',
          activityRailMode: 'expanded',
          splitRatio: layoutSettingLimits.splitRatio.max + 1,
        }),
    }

    expect(loadLayoutSettings(storage)).toEqual({
      ...defaultLayoutSettings,
      activeActivitySection: 'settings',
      activityRailMode: 'expanded',
      splitRatio: layoutSettingLimits.splitRatio.max,
    })
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

    saveApplicationSettings(
      {
        ...defaultApplicationSettings,
        autosave: {
          ...defaultApplicationSettings.autosave,
          enabled: true,
          debounceMs:
            applicationSettingLimits.autosaveDebounceMs.fallback +
            applicationSettingLimits.autosaveDebounceMs.step,
          saveOnWindowBlur: true,
        },
      },
      storage,
    )

    expect(persistedValue).toContain('"autosave"')
    expect(persistedValue).not.toContain('content')
  })
})
