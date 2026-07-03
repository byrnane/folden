export type AutosaveSettings = {
  enabled: boolean
  debounceMs: number
  saveOnWindowBlur: boolean
  saveOnDocumentSwitch: boolean
}

export type RemoteImagePolicy = 'blocked' | 'allow-per-document'

export type WorkspaceSettings = {
  ignoredNames: string[]
}

export type EditorSettings = {
  sourceFontFamily: string
  sourceFontSize: number
  visualFontSize: number
  lineHeight: number
  wordWrap: boolean
  visualMaxWidth: number
  defaultMarkdownMode: 'visual' | 'source'
}

export type AppearanceSettings = {
  uiScale: number
  density: 'compact' | 'comfortable'
  showStatusBar: boolean
  showActivityBar: boolean
  showSidebar: boolean
}

export type ApplicationSettings = {
  autosave: AutosaveSettings
  editor: EditorSettings
  appearance: AppearanceSettings
  remoteImages: {
    policy: RemoteImagePolicy
  }
  workspace: WorkspaceSettings
}

export type ActivitySection = 'workspace' | 'settings'
export type ActivityRailMode = 'compact' | 'expanded'

export type LayoutSettings = {
  activeActivitySection: ActivitySection
  activityRailMode: ActivityRailMode
  activityCompactWidth: number
  activityExpandedWidth: number
  sidebarWidth: number
  splitRatio: number
  focusMode: boolean
}

export const applicationSettingsStorageKey = 'folden:settings:v1'
export const applicationLayoutStorageKey = 'folden:layout:v1'

export type NumberLimit = {
  min: number
  max: number
  fallback: number
}

export type StepNumberLimit = NumberLimit & {
  step: number
}

export const applicationSettingLimits = {
  autosaveDebounceMs: {
    min: 250,
    max: 30_000,
    fallback: 1200,
    step: 250,
  },
  sourceFontSize: {
    min: 10,
    max: 28,
    fallback: 14,
  },
  visualFontSize: {
    min: 12,
    max: 30,
    fallback: 16,
  },
  lineHeight: {
    min: 1.2,
    max: 2.2,
    fallback: 1.65,
    step: 0.05,
  },
  visualMaxWidth: {
    min: 520,
    max: 1120,
    fallback: 720,
  },
  uiScale: {
    min: 0.85,
    max: 1.25,
    fallback: 1,
    step: 0.05,
  },
} as const satisfies Record<string, NumberLimit | StepNumberLimit>

export const layoutSettingLimits = {
  activityCompactWidth: {
    min: 36,
    max: 64,
    fallback: 44,
  },
  activityExpandedWidth: {
    min: 144,
    max: 280,
    fallback: 168,
  },
  sidebarWidth: {
    min: 220,
    max: 520,
    fallback: 292,
  },
  splitRatio: {
    min: 0.25,
    max: 0.75,
    fallback: 0.5,
  },
} as const satisfies Record<string, NumberLimit>

export const activityRailResizeThresholds = {
  expandFromCompactWidth: 104,
  collapseFromExpandedWidth: 96,
} as const

export const legacyLayoutSettingThresholds = {
  expandedActivityRailWidth: layoutSettingLimits.activityCompactWidth.max,
} as const

export const defaultApplicationSettings: ApplicationSettings = {
  autosave: {
    enabled: false,
    debounceMs: applicationSettingLimits.autosaveDebounceMs.fallback,
    saveOnWindowBlur: false,
    saveOnDocumentSwitch: false,
  },
  editor: {
    sourceFontFamily: '"JetBrains Mono", "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    sourceFontSize: applicationSettingLimits.sourceFontSize.fallback,
    visualFontSize: applicationSettingLimits.visualFontSize.fallback,
    lineHeight: applicationSettingLimits.lineHeight.fallback,
    wordWrap: true,
    visualMaxWidth: applicationSettingLimits.visualMaxWidth.fallback,
    defaultMarkdownMode: 'visual',
  },
  appearance: {
    uiScale: applicationSettingLimits.uiScale.fallback,
    density: 'compact',
    showStatusBar: true,
    showActivityBar: true,
    showSidebar: true,
  },
  remoteImages: {
    policy: 'blocked',
  },
  workspace: {
    ignoredNames: ['.git', 'node_modules', 'dist', 'build', 'target', '.cache'],
  },
}

export const defaultLayoutSettings: LayoutSettings = {
  activeActivitySection: 'workspace',
  activityRailMode: 'compact',
  activityCompactWidth: layoutSettingLimits.activityCompactWidth.fallback,
  activityExpandedWidth: layoutSettingLimits.activityExpandedWidth.fallback,
  sidebarWidth: layoutSettingLimits.sidebarWidth.fallback,
  splitRatio: layoutSettingLimits.splitRatio.fallback,
  focusMode: false,
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : fallback
}

export function normalizeWorkspaceIgnoredNames(value: unknown) {
  const extras = Array.isArray(value)
    ? value.filter((name) => typeof name === 'string' && name.trim().length > 0)
    : []

  return [...new Set([
    ...defaultApplicationSettings.workspace.ignoredNames,
    ...extras,
  ])]
}

export function normalizeApplicationSettings(value: unknown): ApplicationSettings {
  if (typeof value !== 'object' || value === null) {
    return structuredClone(defaultApplicationSettings)
  }

  const candidate = value as Partial<ApplicationSettings>
  const autosave = typeof candidate.autosave === 'object' && candidate.autosave !== null
    ? candidate.autosave as Partial<AutosaveSettings>
    : {}
  const editor = typeof candidate.editor === 'object' && candidate.editor !== null
    ? candidate.editor as Partial<EditorSettings>
    : {}
  const appearance = typeof candidate.appearance === 'object' && candidate.appearance !== null
    ? candidate.appearance as Partial<AppearanceSettings>
    : {}
  const remoteImages = typeof candidate.remoteImages === 'object' && candidate.remoteImages !== null
    ? candidate.remoteImages as Partial<ApplicationSettings['remoteImages']>
    : {}
  const workspace = typeof candidate.workspace === 'object' && candidate.workspace !== null
    ? candidate.workspace as Partial<WorkspaceSettings>
    : {}

  return {
    autosave: {
      enabled: typeof autosave.enabled === 'boolean'
        ? autosave.enabled
        : defaultApplicationSettings.autosave.enabled,
      debounceMs: typeof autosave.debounceMs === 'number' && autosave.debounceMs >= applicationSettingLimits.autosaveDebounceMs.min
        ? Math.min(autosave.debounceMs, applicationSettingLimits.autosaveDebounceMs.max)
        : defaultApplicationSettings.autosave.debounceMs,
      saveOnWindowBlur: typeof autosave.saveOnWindowBlur === 'boolean'
        ? autosave.saveOnWindowBlur
        : defaultApplicationSettings.autosave.saveOnWindowBlur,
      saveOnDocumentSwitch: typeof autosave.saveOnDocumentSwitch === 'boolean'
        ? autosave.saveOnDocumentSwitch
        : defaultApplicationSettings.autosave.saveOnDocumentSwitch,
    },
    editor: {
      sourceFontFamily: typeof editor.sourceFontFamily === 'string' && editor.sourceFontFamily.trim()
        ? editor.sourceFontFamily.trim()
        : defaultApplicationSettings.editor.sourceFontFamily,
      sourceFontSize: clampNumber(
        editor.sourceFontSize,
        applicationSettingLimits.sourceFontSize.min,
        applicationSettingLimits.sourceFontSize.max,
        defaultApplicationSettings.editor.sourceFontSize,
      ),
      visualFontSize: clampNumber(
        editor.visualFontSize,
        applicationSettingLimits.visualFontSize.min,
        applicationSettingLimits.visualFontSize.max,
        defaultApplicationSettings.editor.visualFontSize,
      ),
      lineHeight: clampNumber(
        editor.lineHeight,
        applicationSettingLimits.lineHeight.min,
        applicationSettingLimits.lineHeight.max,
        defaultApplicationSettings.editor.lineHeight,
      ),
      wordWrap: typeof editor.wordWrap === 'boolean'
        ? editor.wordWrap
        : defaultApplicationSettings.editor.wordWrap,
      visualMaxWidth: clampNumber(
        editor.visualMaxWidth,
        applicationSettingLimits.visualMaxWidth.min,
        applicationSettingLimits.visualMaxWidth.max,
        defaultApplicationSettings.editor.visualMaxWidth,
      ),
      defaultMarkdownMode: editor.defaultMarkdownMode === 'source'
        ? 'source'
        : defaultApplicationSettings.editor.defaultMarkdownMode,
    },
    appearance: {
      uiScale: clampNumber(
        appearance.uiScale,
        applicationSettingLimits.uiScale.min,
        applicationSettingLimits.uiScale.max,
        defaultApplicationSettings.appearance.uiScale,
      ),
      density: appearance.density === 'comfortable'
        ? 'comfortable'
        : defaultApplicationSettings.appearance.density,
      showStatusBar: typeof appearance.showStatusBar === 'boolean'
        ? appearance.showStatusBar
        : defaultApplicationSettings.appearance.showStatusBar,
      showActivityBar: typeof appearance.showActivityBar === 'boolean'
        ? appearance.showActivityBar
        : defaultApplicationSettings.appearance.showActivityBar,
      showSidebar: typeof appearance.showSidebar === 'boolean'
        ? appearance.showSidebar
        : defaultApplicationSettings.appearance.showSidebar,
    },
    remoteImages: {
      policy: remoteImages.policy === 'allow-per-document'
        ? 'allow-per-document'
        : defaultApplicationSettings.remoteImages.policy,
    },
    workspace: {
      ignoredNames: normalizeWorkspaceIgnoredNames(workspace.ignoredNames),
    },
  }
}

export function normalizeLayoutSettings(value: unknown): LayoutSettings {
  if (typeof value !== 'object' || value === null) {
    return structuredClone(defaultLayoutSettings)
  }

  const candidate = value as Partial<LayoutSettings>
  const legacyActivityWidth = (candidate as Partial<LayoutSettings> & { activityWidth?: unknown }).activityWidth
  const migratedActivityRailMode = typeof legacyActivityWidth === 'number'
    && legacyActivityWidth > legacyLayoutSettingThresholds.expandedActivityRailWidth
    ? 'expanded'
    : defaultLayoutSettings.activityRailMode

  return {
    activeActivitySection: candidate.activeActivitySection === 'settings'
      ? 'settings'
      : defaultLayoutSettings.activeActivitySection,
    activityRailMode: candidate.activityRailMode === 'expanded' || candidate.activityRailMode === 'compact'
      ? candidate.activityRailMode
      : migratedActivityRailMode,
    activityCompactWidth: clampNumber(
      candidate.activityCompactWidth ?? legacyActivityWidth,
      layoutSettingLimits.activityCompactWidth.min,
      layoutSettingLimits.activityCompactWidth.max,
      defaultLayoutSettings.activityCompactWidth,
    ),
    activityExpandedWidth: clampNumber(
      candidate.activityExpandedWidth ?? legacyActivityWidth,
      layoutSettingLimits.activityExpandedWidth.min,
      layoutSettingLimits.activityExpandedWidth.max,
      defaultLayoutSettings.activityExpandedWidth,
    ),
    sidebarWidth: clampNumber(
      candidate.sidebarWidth,
      layoutSettingLimits.sidebarWidth.min,
      layoutSettingLimits.sidebarWidth.max,
      defaultLayoutSettings.sidebarWidth,
    ),
    splitRatio: clampNumber(
      candidate.splitRatio,
      layoutSettingLimits.splitRatio.min,
      layoutSettingLimits.splitRatio.max,
      defaultLayoutSettings.splitRatio,
    ),
    focusMode: typeof candidate.focusMode === 'boolean'
      ? candidate.focusMode
      : defaultLayoutSettings.focusMode,
  }
}

export function loadApplicationSettings(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  const rawValue = storage.getItem(applicationSettingsStorageKey)

  if (!rawValue) {
    return structuredClone(defaultApplicationSettings)
  }

  try {
    return normalizeApplicationSettings(JSON.parse(rawValue))
  } catch {
    return structuredClone(defaultApplicationSettings)
  }
}

export function saveApplicationSettings(
  settings: ApplicationSettings,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  storage.setItem(applicationSettingsStorageKey, JSON.stringify(settings))
}

export function loadLayoutSettings(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  const rawValue = storage.getItem(applicationLayoutStorageKey)

  if (!rawValue) {
    return structuredClone(defaultLayoutSettings)
  }

  try {
    return normalizeLayoutSettings(JSON.parse(rawValue))
  } catch {
    return structuredClone(defaultLayoutSettings)
  }
}

export function saveLayoutSettings(
  settings: LayoutSettings,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  storage.setItem(applicationLayoutStorageKey, JSON.stringify(settings))
}
