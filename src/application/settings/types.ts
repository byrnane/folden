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

export type ActivitySection = 'workspace' | 'search' | 'create' | 'settings'
export type ActivityRailMode = 'compact' | 'expanded'

export type LayoutSettings = {
  activeActivitySection: ActivitySection
  activityRailMode: ActivityRailMode
  activityCompactWidth: number
  activityExpandedWidth: number
  sidebarWidth: number
  splitRatio: number
  outlineWidth: number
  documentMapWidth: number
  showDocumentOutline: boolean
  showDocumentMap: boolean
  focusMode: boolean
}

export type NumberLimit = {
  min: number
  max: number
  fallback: number
}

export type StepNumberLimit = NumberLimit & {
  step: number
}
