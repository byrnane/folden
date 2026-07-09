import type { ApplicationSettings, LayoutSettings } from './types'
import {
  applicationSettingLimits,
  layoutSettingLimits,
} from './limits'

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
  outlineWidth: layoutSettingLimits.outlineWidth.fallback,
  documentMapWidth: layoutSettingLimits.documentMapWidth.fallback,
  focusMode: false,
}
