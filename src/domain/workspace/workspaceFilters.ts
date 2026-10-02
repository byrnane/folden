import type { WorkspaceEntry } from '../native'

export function filterWorkspaceEntriesByIgnoredNames(
  entries: WorkspaceEntry[],
  ignoredNames: string[],
): WorkspaceEntry[] {
  const ignoredNameSet = new Set(ignoredNames.map((name) => name.toLowerCase()))

  return entries.flatMap((entry) => {
    if (ignoredNameSet.has(entry.name.toLowerCase())) {
      return []
    }

    if (entry.kind !== 'directory' || entry.children.length === 0) {
      return [entry]
    }

    return [
      {
        ...entry,
        children: filterWorkspaceEntriesByIgnoredNames(entry.children, ignoredNames),
      },
    ]
  })
}

function normalizeWorkspacePath(path: string) {
  const normalized = path
    .replaceAll('\\', '/')
    .replace(/\/+/gu, '/')
    .replace(/^\/|\/$/gu, '')
  return typeof navigator !== 'undefined' && /^Win/.test(navigator.platform)
    ? normalized.toLowerCase()
    : normalized
}

function isSameOrChildPath(path: string, parent: string) {
  const normalizedPath = normalizeWorkspacePath(path)
  const normalizedParent = normalizeWorkspacePath(parent)

  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`)
}

export function filterWorkspaceEntries(
  entries: WorkspaceEntry[],
  ignoredNames: string[],
  ignoredPaths: string[],
): WorkspaceEntry[] {
  const ignoredNameSet = new Set(ignoredNames.map((name) => name.toLowerCase()))
  const ignoredPathSet = ignoredPaths.map(normalizeWorkspacePath).filter(Boolean)

  return entries.flatMap((entry) => {
    if (
      ignoredNameSet.has(entry.name.toLowerCase()) ||
      ignoredPathSet.some((ignoredPath) => isSameOrChildPath(entry.path, ignoredPath))
    ) {
      return []
    }

    if (entry.kind !== 'directory' || entry.children.length === 0) {
      return [entry]
    }

    const children = filterWorkspaceEntries(entry.children, ignoredNames, ignoredPaths)

    return [
      {
        ...entry,
        openableState: children.some(
          (child) => child.kind === 'file' || child.openableState === 'present',
        )
          ? 'present'
          : children.some(
                (child) => child.kind === 'directory' && child.openableState === 'unknown',
              )
            ? 'unknown'
            : 'empty',
        children,
      },
    ]
  })
}
