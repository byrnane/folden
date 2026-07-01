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

    return [{
      ...entry,
      children: filterWorkspaceEntriesByIgnoredNames(entry.children, ignoredNames),
    }]
  })
}
