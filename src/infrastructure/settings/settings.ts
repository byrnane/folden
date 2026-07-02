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

export type LayoutSettings = {
  activeActivitySection: ActivitySection
  activityWidth: number
  sidebarWidth: number
  splitRatio: number
  focusMode: boolean
}

export const applicationSettingsStorageKey = 'folden:settings:v1'
export const applicationLayoutStorageKey = 'folden:layout:v1'

export const defaultApplicationSettings: ApplicationSettings = {
  autosave: {
    enabled: false,
    debounceMs: 1200,
    saveOnWindowBlur: false,
    saveOnDocumentSwitch: false,
  },
  editor: {
    sourceFontFamily: '"JetBrains Mono", "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    sourceFontSize: 14,
    visualFontSize: 16,
    lineHeight: 1.65,
    wordWrap: true,
    visualMaxWidth: 720,
    defaultMarkdownMode: 'visual',
  },
  appearance: {
    uiScale: 1,
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
  activityWidth: 44,
  sidebarWidth: 292,
  splitRatio: 0.5,
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
      debounceMs: typeof autosave.debounceMs === 'number' && autosave.debounceMs >= 250
        ? Math.min(autosave.debounceMs, 30_000)
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
      sourceFontSize: clampNumber(editor.sourceFontSize, 10, 28, defaultApplicationSettings.editor.sourceFontSize),
      visualFontSize: clampNumber(editor.visualFontSize, 12, 30, defaultApplicationSettings.editor.visualFontSize),
      lineHeight: clampNumber(editor.lineHeight, 1.2, 2.2, defaultApplicationSettings.editor.lineHeight),
      wordWrap: typeof editor.wordWrap === 'boolean'
        ? editor.wordWrap
        : defaultApplicationSettings.editor.wordWrap,
      visualMaxWidth: clampNumber(editor.visualMaxWidth, 520, 1120, defaultApplicationSettings.editor.visualMaxWidth),
      defaultMarkdownMode: editor.defaultMarkdownMode === 'source'
        ? 'source'
        : defaultApplicationSettings.editor.defaultMarkdownMode,
    },
    appearance: {
      uiScale: clampNumber(appearance.uiScale, 0.85, 1.25, defaultApplicationSettings.appearance.uiScale),
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

  return {
    activeActivitySection: candidate.activeActivitySection === 'settings'
      ? 'settings'
      : defaultLayoutSettings.activeActivitySection,
    activityWidth: clampNumber(candidate.activityWidth, 44, 132, defaultLayoutSettings.activityWidth),
    sidebarWidth: clampNumber(candidate.sidebarWidth, 220, 520, defaultLayoutSettings.sidebarWidth),
    splitRatio: clampNumber(candidate.splitRatio, 0.25, 0.75, defaultLayoutSettings.splitRatio),
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
