import type { NumberLimit, StepNumberLimit } from './types'

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
