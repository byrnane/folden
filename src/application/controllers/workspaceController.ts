import { ref, type Ref } from 'vue'
import { filterWorkspaceEntriesByIgnoredNames } from '../../domain/workspace/workspaceFilters'
import type { ApplicationSettings } from '../../infrastructure/settings/settings'
import type { WorkspaceEntry } from '../../infrastructure/tauri/files'
import { normalizePath } from '../helpers/pathHelpers'
import type { Workspace } from '../types/shell'

const recentWorkspaceStorageKey = 'folden:recent-workspaces'

export function createWorkspaceController(appSettings: Ref<ApplicationSettings>) {
  const workspace = ref<Workspace | null>(null)
  const expandedWorkspacePaths = ref(new Set<string>())
  const loadedWorkspacePaths = ref(new Set<string>())
  const loadingWorkspacePaths = ref(new Set<string>())
  const workspaceLoadErrors = ref<Record<string, string>>({})
  const selectedPath = ref<string | null>(null)
  const recentWorkspaces = ref(loadRecentWorkspaces())

  function loadRecentWorkspaces() {
    const rawValue = window.localStorage.getItem(recentWorkspaceStorageKey)

    if (!rawValue) {
      return []
    }

    try {
      const parsedValue = JSON.parse(rawValue)
      return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === 'string') : []
    } catch {
      return []
    }
  }

  function saveRecentWorkspaces(paths: string[]) {
    recentWorkspaces.value = [...new Set(paths)].slice(0, 6)
    window.localStorage.setItem(recentWorkspaceStorageKey, JSON.stringify(recentWorkspaces.value))
  }

  function clonePathSet(source: Set<string>) {
    return new Set(source)
  }

  function setWorkspacePathLoaded(path: string, loaded: boolean) {
    const nextLoadedPaths = clonePathSet(loadedWorkspacePaths.value)

    if (loaded) {
      nextLoadedPaths.add(path)
    } else {
      nextLoadedPaths.delete(path)
    }

    loadedWorkspacePaths.value = nextLoadedPaths
  }

  function setWorkspacePathLoading(path: string, loading: boolean) {
    const nextLoadingPaths = clonePathSet(loadingWorkspacePaths.value)

    if (loading) {
      nextLoadingPaths.add(path)
    } else {
      nextLoadingPaths.delete(path)
    }

    loadingWorkspacePaths.value = nextLoadingPaths
  }

  function setWorkspacePathExpanded(path: string, expanded: boolean) {
    const nextExpandedPaths = clonePathSet(expandedWorkspacePaths.value)

    if (expanded) {
      nextExpandedPaths.add(path)
    } else {
      nextExpandedPaths.delete(path)
    }

    expandedWorkspacePaths.value = nextExpandedPaths
  }

  function applyWorkspaceEntryFilters(entries: WorkspaceEntry[]) {
    return filterWorkspaceEntriesByIgnoredNames(
      entries,
      appSettings.value.workspace.ignoredNames,
    )
  }

  function clearWorkspaceLoadError(path: string) {
    if (!(path in workspaceLoadErrors.value)) {
      return
    }

    const nextErrors = { ...workspaceLoadErrors.value }
    delete nextErrors[path]
    workspaceLoadErrors.value = nextErrors
  }

  function setWorkspaceLoadError(path: string, message: string) {
    workspaceLoadErrors.value = {
      ...workspaceLoadErrors.value,
      [path]: message,
    }
  }

  function removeWorkspacePathState(path: string) {
    const normalizedTargetPath = normalizePath(path)
    loadedWorkspacePaths.value = new Set(
      [...loadedWorkspacePaths.value].filter((value) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue !== normalizedTargetPath
          && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
      }),
    )
    loadingWorkspacePaths.value = new Set(
      [...loadingWorkspacePaths.value].filter((value) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue !== normalizedTargetPath
          && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
      }),
    )
    expandedWorkspacePaths.value = new Set(
      [...expandedWorkspacePaths.value].filter((value) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue !== normalizedTargetPath
          && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
      }),
    )
    workspaceLoadErrors.value = Object.fromEntries(
      Object.entries(workspaceLoadErrors.value).filter(([value]) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue !== normalizedTargetPath
          && !normalizedValue.startsWith(`${normalizedTargetPath}\\`)
      }),
    )
  }

  function remapWorkspacePathState(previousPath: string, nextPath: string) {
    const normalizedPreviousPath = normalizePath(previousPath)
    const remapPath = (value: string) => (
      normalizePath(value) === normalizedPreviousPath
        ? nextPath
        : `${nextPath}${value.slice(previousPath.length)}`
    )
    loadedWorkspacePaths.value = new Set(
      [...loadedWorkspacePaths.value].map((value) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue === normalizedPreviousPath
          || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
          ? remapPath(value)
          : value
      }),
    )
    loadingWorkspacePaths.value = new Set(
      [...loadingWorkspacePaths.value].map((value) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue === normalizedPreviousPath
          || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
          ? remapPath(value)
          : value
      }),
    )
    expandedWorkspacePaths.value = new Set(
      [...expandedWorkspacePaths.value].map((value) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue === normalizedPreviousPath
          || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
          ? remapPath(value)
          : value
      }),
    )
    workspaceLoadErrors.value = Object.fromEntries(
      Object.entries(workspaceLoadErrors.value).map(([value, message]) => {
        const normalizedValue = normalizePath(value)
        return normalizedValue === normalizedPreviousPath
          || normalizedValue.startsWith(`${normalizedPreviousPath}\\`)
          ? [remapPath(value), message]
          : [value, message]
      }),
    )
  }

  function clearSidebarSelection() {
    selectedPath.value = null
  }

  return {
    workspace,
    expandedWorkspacePaths,
    loadedWorkspacePaths,
    loadingWorkspacePaths,
    workspaceLoadErrors,
    selectedPath,
    recentWorkspaces,
    saveRecentWorkspaces,
    setWorkspacePathLoaded,
    setWorkspacePathLoading,
    setWorkspacePathExpanded,
    applyWorkspaceEntryFilters,
    clearWorkspaceLoadError,
    setWorkspaceLoadError,
    removeWorkspacePathState,
    remapWorkspacePathState,
    clearSidebarSelection,
  }
}
