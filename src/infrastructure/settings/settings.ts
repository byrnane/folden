export type AutosaveSettings = {
  enabled: boolean
  debounceMs: number
}

export type RemoteImagePolicy = 'blocked' | 'allow-per-document'

export type WorkspaceSettings = {
  ignoredNames: string[]
}

export type ApplicationSettings = {
  autosave: AutosaveSettings
  remoteImages: {
    policy: RemoteImagePolicy
  }
  workspace: WorkspaceSettings
}

export const applicationSettingsStorageKey = 'folden:settings:v1'

export const defaultApplicationSettings: ApplicationSettings = {
  autosave: {
    enabled: false,
    debounceMs: 1200,
  },
  remoteImages: {
    policy: 'blocked',
  },
  workspace: {
    ignoredNames: ['.git', 'node_modules', 'dist', 'build', 'target', '.cache'],
  },
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
