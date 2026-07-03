import {
  defaultApplicationSettings,
  defaultLayoutSettings,
  normalizeApplicationSettings,
  normalizeLayoutSettings,
  type ApplicationSettings,
  type LayoutSettings,
} from '../../application/settings'

export const applicationSettingsStorageKey = 'folden:settings:v1'
export const applicationLayoutStorageKey = 'folden:layout:v1'

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
