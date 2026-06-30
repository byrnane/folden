import { readonly, ref, type Ref } from 'vue'
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

  function recentWorkspaceStorage() {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  }

  function loadRecentWorkspaces() {
    const rawValue = recentWorkspaceStorage()?.getItem(recentWorkspaceStorageKey)

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
    recentWorkspaceStorage()?.setItem(recentWorkspaceStorageKey, JSON.stringify(recentWorkspaces.value))
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

  function setSelectedPath(path: string | null) {
    selectedPath.value = path
  }

  function setWatcherVisibleWorkspace(descriptor: { id: string, rootPath: string, name: string }, entries: WorkspaceEntry[]) {
    workspace.value = {
      id: descriptor.id,
      rootPath: descriptor.rootPath,
      name: descriptor.name,
      entries: applyWorkspaceEntryFilters(entries),
    }
    expandedWorkspacePaths.value = new Set()
    loadedWorkspacePaths.value = new Set([''])
    loadingWorkspacePaths.value = new Set()
    workspaceLoadErrors.value = {}
    selectedPath.value = null
    saveRecentWorkspaces([descriptor.rootPath, ...recentWorkspaces.value])
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

  function findEntry(entries: WorkspaceEntry[], path: string): WorkspaceEntry | null {
    for (const entry of entries) {
      if (entry.path === path) {
        return entry
      }

      const child = findEntry(entry.children, path)

      if (child) {
        return child
      }
    }

    return null
  }

  function selectedDirectoryPath(parentPath: (path: string) => string | null) {
    if (!workspace.value) {
      return null
    }

    if (!selectedPath.value) {
      return ''
    }

    const entry = findEntry(workspace.value.entries, selectedPath.value)

    if (!entry) {
      return ''
    }

    if (entry.kind === 'directory') {
      return entry.path
    }

    return parentPath(entry.path) ?? ''
  }

  function replaceWorkspaceBranch(
    entries: WorkspaceEntry[],
    branchPath: string,
    nextChildren: WorkspaceEntry[],
  ): WorkspaceEntry[] {
    if (!branchPath) {
      return nextChildren
    }

    return entries.map((entry) => {
      if (entry.path === branchPath && entry.kind === 'directory') {
        return {
          ...entry,
          children: nextChildren,
        }
      }

      if (entry.kind !== 'directory' || entry.children.length === 0) {
        return entry
      }

      return {
        ...entry,
        children: replaceWorkspaceBranch(entry.children, branchPath, nextChildren),
      }
    })
  }

  function applyWorkspaceBranch(branchPath: string | null, children: WorkspaceEntry[]) {
    if (!workspace.value) {
      return
    }

    const normalizedBranchPath = branchPath ?? ''
    const nextChildren = applyWorkspaceEntryFilters(children)

    if (normalizedBranchPath === '') {
      workspace.value.entries = nextChildren
    } else {
      workspace.value.entries = replaceWorkspaceBranch(
        workspace.value.entries,
        normalizedBranchPath,
        nextChildren,
      )
    }

    setWorkspacePathLoaded(normalizedBranchPath, true)
  }

  function loadedDescendantPaths(branchPath: string, isSameOrChildPath: (path: string, parent: string) => boolean) {
    return [...loadedWorkspacePaths.value]
      .filter((value) => value !== branchPath && value !== '')
      .filter((value) => (
        branchPath === ''
          ? true
          : isSameOrChildPath(value, branchPath)
      ))
      .sort((left, right) => left.split('\\').length - right.split('\\').length)
  }

  function shouldLoadBranch(branchPath: string) {
    return Boolean(
      workspace.value &&
      !loadedWorkspacePaths.value.has(branchPath) &&
      !loadingWorkspacePaths.value.has(branchPath),
    )
  }

  function nearestLoadedWorkspaceBranch(branchPath: string | null, parentPath: (path: string) => string | null) {
    let currentPath = branchPath ?? ''

    while (currentPath) {
      if (loadedWorkspacePaths.value.has(currentPath)) {
        return currentPath
      }

      currentPath = parentPath(currentPath) ?? ''
    }

    return ''
  }

  function workspaceRelativePathFromAbsolute(path: string, cleanDisplayPath: (path: string) => string) {
    if (!workspace.value) {
      return null
    }

    const normalizedRoot = normalizePath(workspace.value.rootPath)
    const normalizedPath = normalizePath(path)

    if (normalizedPath === normalizedRoot) {
      return ''
    }

    if (!normalizedPath.startsWith(`${normalizedRoot}\\`)) {
      return null
    }

    return cleanDisplayPath(path).slice(cleanDisplayPath(workspace.value.rootPath).length + 1)
  }

  return {
    workspace: readonly(workspace),
    expandedWorkspacePaths: readonly(expandedWorkspacePaths),
    loadedWorkspacePaths: readonly(loadedWorkspacePaths),
    loadingWorkspacePaths: readonly(loadingWorkspacePaths),
    workspaceLoadErrors: readonly(workspaceLoadErrors),
    selectedPath: readonly(selectedPath),
    recentWorkspaces: readonly(recentWorkspaces),
    saveRecentWorkspaces,
    setWorkspacePathLoaded,
    setWorkspacePathLoading,
    setWorkspacePathExpanded,
    setSelectedPath,
    setWatcherVisibleWorkspace,
    applyWorkspaceEntryFilters,
    clearWorkspaceLoadError,
    setWorkspaceLoadError,
    removeWorkspacePathState,
    remapWorkspacePathState,
    clearSidebarSelection,
    findEntry,
    selectedDirectoryPath,
    applyWorkspaceBranch,
    loadedDescendantPaths,
    shouldLoadBranch,
    nearestLoadedWorkspaceBranch,
    workspaceRelativePathFromAbsolute,
  }
}
