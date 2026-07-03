import {
  defaultApplicationSettings,
  defaultLayoutSettings,
  layoutSettingLimits,
  normalizeApplicationSettings,
  normalizeLayoutSettings,
  type ApplicationSettings,
  type LayoutSettings,
} from '../../application/settings'

export const applicationSettingsStorageKey = 'folden:settings:v1'
export const applicationLayoutStorageKey = 'folden:layout:v1'

function migratePersistedLayoutSettings(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return value
  }

  const candidate = value as Record<string, unknown>
  const legacyActivityWidth = candidate.activityWidth

  if (typeof legacyActivityWidth !== 'number' || !Number.isFinite(legacyActivityWidth)) {
    return value
  }

  return {
    ...candidate,
    activityRailMode: candidate.activityRailMode === 'compact' || candidate.activityRailMode === 'expanded'
      ? candidate.activityRailMode
      : legacyActivityWidth > layoutSettingLimits.activityCompactWidth.max ? 'expanded' : 'compact',
    activityCompactWidth: candidate.activityCompactWidth ?? legacyActivityWidth,
    activityExpandedWidth: candidate.activityExpandedWidth ?? legacyActivityWidth,
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
    const persistedLayout = JSON.parse(rawValue)
    return normalizeLayoutSettings(migratePersistedLayoutSettings(persistedLayout))
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
