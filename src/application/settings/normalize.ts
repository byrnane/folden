import { defaultApplicationSettings, defaultLayoutSettings } from './defaults'
import { systemLanguage } from '../systemLanguage'
import { applicationSettingLimits, layoutSettingLimits } from './limits'
import type {
  AppearanceSettings,
  ApplicationSettings,
  AutosaveSettings,
  EditorSettings,
  LayoutSettings,
  WorkspaceSettings,
} from './types'
import { isThemeId } from './themes'

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : fallback
}

export function normalizeWorkspaceIgnoredNames(value: unknown) {
  const extras = Array.isArray(value)
    ? value.filter((name) => typeof name === 'string' && name.trim().length > 0)
    : []

  return [...new Set([...defaultApplicationSettings.workspace.ignoredNames, ...extras])]
}

export function normalizeApplicationSettings(value: unknown): ApplicationSettings {
  if (typeof value !== 'object' || value === null) {
    return { ...structuredClone(defaultApplicationSettings), language: systemLanguage() }
  }

  const candidate = value as Partial<ApplicationSettings>
  const autosave =
    typeof candidate.autosave === 'object' && candidate.autosave !== null
      ? (candidate.autosave as Partial<AutosaveSettings>)
      : {}
  const editor =
    typeof candidate.editor === 'object' && candidate.editor !== null
      ? (candidate.editor as Partial<EditorSettings>)
      : {}
  const appearance =
    typeof candidate.appearance === 'object' && candidate.appearance !== null
      ? (candidate.appearance as Partial<AppearanceSettings>)
      : {}
  const remoteImages =
    typeof candidate.remoteImages === 'object' && candidate.remoteImages !== null
      ? (candidate.remoteImages as Partial<ApplicationSettings['remoteImages']>)
      : {}
  const workspace =
    typeof candidate.workspace === 'object' && candidate.workspace !== null
      ? (candidate.workspace as Partial<WorkspaceSettings>)
      : {}

  return {
    language:
      candidate.language === 'ru' || candidate.language === 'en'
        ? candidate.language
        : systemLanguage(),
    autosave: {
      enabled:
        typeof autosave.enabled === 'boolean'
          ? autosave.enabled
          : defaultApplicationSettings.autosave.enabled,
      debounceMs:
        typeof autosave.debounceMs === 'number' &&
        autosave.debounceMs >= applicationSettingLimits.autosaveDebounceMs.min
          ? Math.min(autosave.debounceMs, applicationSettingLimits.autosaveDebounceMs.max)
          : defaultApplicationSettings.autosave.debounceMs,
      saveOnWindowBlur:
        typeof autosave.saveOnWindowBlur === 'boolean'
          ? autosave.saveOnWindowBlur
          : defaultApplicationSettings.autosave.saveOnWindowBlur,
      saveOnDocumentSwitch:
        typeof autosave.saveOnDocumentSwitch === 'boolean'
          ? autosave.saveOnDocumentSwitch
          : defaultApplicationSettings.autosave.saveOnDocumentSwitch,
    },
    editor: {
      sourceFontFamily:
        typeof editor.sourceFontFamily === 'string' && editor.sourceFontFamily.trim()
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
      wordWrap:
        typeof editor.wordWrap === 'boolean'
          ? editor.wordWrap
          : defaultApplicationSettings.editor.wordWrap,
      visualMaxWidth: clampNumber(
        editor.visualMaxWidth,
        applicationSettingLimits.visualMaxWidth.min,
        applicationSettingLimits.visualMaxWidth.max,
        defaultApplicationSettings.editor.visualMaxWidth,
      ),
      defaultMarkdownMode:
        editor.defaultMarkdownMode === 'source'
          ? 'source'
          : defaultApplicationSettings.editor.defaultMarkdownMode,
    },
    appearance: {
      theme: isThemeId(appearance.theme)
        ? appearance.theme
        : defaultApplicationSettings.appearance.theme,
      uiScale: clampNumber(
        appearance.uiScale,
        applicationSettingLimits.uiScale.min,
        applicationSettingLimits.uiScale.max,
        defaultApplicationSettings.appearance.uiScale,
      ),
      density:
        appearance.density === 'comfortable'
          ? 'comfortable'
          : defaultApplicationSettings.appearance.density,
      showStatusBar:
        typeof appearance.showStatusBar === 'boolean'
          ? appearance.showStatusBar
          : defaultApplicationSettings.appearance.showStatusBar,
      showActivityBar:
        typeof appearance.showActivityBar === 'boolean'
          ? appearance.showActivityBar
          : defaultApplicationSettings.appearance.showActivityBar,
      showSidebar:
        typeof appearance.showSidebar === 'boolean'
          ? appearance.showSidebar
          : defaultApplicationSettings.appearance.showSidebar,
    },
    remoteImages: {
      policy:
        remoteImages.policy === 'allow-per-document'
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
    activeActivitySection:
      candidate.activeActivitySection === 'search' ||
      candidate.activeActivitySection === 'create' ||
      candidate.activeActivitySection === 'settings'
        ? candidate.activeActivitySection
        : defaultLayoutSettings.activeActivitySection,
    activityRailMode:
      candidate.activityRailMode === 'expanded' || candidate.activityRailMode === 'compact'
        ? candidate.activityRailMode
        : defaultLayoutSettings.activityRailMode,
    activityCompactWidth: clampNumber(
      candidate.activityCompactWidth,
      layoutSettingLimits.activityCompactWidth.min,
      layoutSettingLimits.activityCompactWidth.max,
      defaultLayoutSettings.activityCompactWidth,
    ),
    activityExpandedWidth: clampNumber(
      candidate.activityExpandedWidth,
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
    outlineWidth: clampNumber(
      candidate.outlineWidth,
      layoutSettingLimits.outlineWidth.min,
      layoutSettingLimits.outlineWidth.max,
      defaultLayoutSettings.outlineWidth,
    ),
    documentMapWidth: clampNumber(
      candidate.documentMapWidth,
      layoutSettingLimits.documentMapWidth.min,
      layoutSettingLimits.documentMapWidth.max,
      defaultLayoutSettings.documentMapWidth,
    ),
    showDocumentOutline:
      typeof candidate.showDocumentOutline === 'boolean'
        ? candidate.showDocumentOutline
        : defaultLayoutSettings.showDocumentOutline,
    showDocumentMap:
      typeof candidate.showDocumentMap === 'boolean'
        ? candidate.showDocumentMap
        : defaultLayoutSettings.showDocumentMap,
    focusMode:
      typeof candidate.focusMode === 'boolean'
        ? candidate.focusMode
        : defaultLayoutSettings.focusMode,
  }
}
