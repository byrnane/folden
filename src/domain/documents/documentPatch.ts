export type DocumentPatch = {
  from: number
  to: number
  insert: string
  removed: string
}

export function createDocumentPatch(previous: string, next: string): DocumentPatch | null {
  if (previous === next) {
    return null
  }

  let prefix = 0
  const maxPrefix = Math.min(previous.length, next.length)
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) {
    prefix += 1
  }

  let previousSuffix = previous.length
  let nextSuffix = next.length
  while (
    previousSuffix > prefix &&
    nextSuffix > prefix &&
    previous[previousSuffix - 1] === next[nextSuffix - 1]
  ) {
    previousSuffix -= 1
    nextSuffix -= 1
  }

  return {
    from: prefix,
    to: previousSuffix,
    insert: next.slice(prefix, nextSuffix),
    removed: previous.slice(prefix, previousSuffix),
  }
}

export function applyDocumentPatch(content: string, patch: DocumentPatch) {
  if (patch.from < 0 || patch.to < patch.from || patch.to > content.length) {
    return null
  }

  if (content.slice(patch.from, patch.to) !== patch.removed) {
    return null
  }

  return `${content.slice(0, patch.from)}${patch.insert}${content.slice(patch.to)}`
}

export function invertDocumentPatch(patch: DocumentPatch): DocumentPatch {
  return {
    from: patch.from,
    to: patch.from + patch.insert.length,
    insert: patch.removed,
    removed: patch.insert,
  }
}

export function documentPatchSize(patch: DocumentPatch) {
  return (patch.insert.length + patch.removed.length) * 2
}
