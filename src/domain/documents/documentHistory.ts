import {
  applyDocumentPatch,
  createDocumentPatch,
  documentPatchSize,
  invertDocumentPatch,
  type DocumentPatch,
} from './documentPatch'

export type DocumentHistoryEntry = {
  forward: DocumentPatch[]
  backward: DocumentPatch[]
  group: string
  timestamp: number
  size: number
}

export type DocumentHistoryState = {
  past: DocumentHistoryEntry[]
  future: DocumentHistoryEntry[]
  size?: number
}

const DOCUMENT_HISTORY_LIMIT = 100
const DOCUMENT_HISTORY_SIZE_LIMIT = 64 * 1024 * 1024
const DOCUMENT_HISTORY_COALESCE_MS = 750

export function createDocumentHistoryState(): DocumentHistoryState {
  return { past: [], future: [], size: 0 }
}

function trimHistory(entries: DocumentHistoryEntry[]) {
  const next = entries.slice(-DOCUMENT_HISTORY_LIMIT)
  let size = next.reduce((total, entry) => total + entry.size, 0)

  while (next.length && size > DOCUMENT_HISTORY_SIZE_LIMIT) {
    size -= next.shift()!.size
  }

  return { entries: next, size }
}

export function recordDocumentHistory(
  history: DocumentHistoryState,
  previousContent: string,
  nextContent: string,
  group = 'edit',
  timestamp = Date.now(),
): DocumentHistoryState {
  const patch = createDocumentPatch(previousContent, nextContent)
  if (!patch) return history

  return recordDocumentPatchHistory(history, [patch], group, timestamp)
}

export function recordDocumentPatchHistory(
  history: DocumentHistoryState,
  patches: readonly DocumentPatch[],
  group = 'edit',
  timestamp = Date.now(),
): DocumentHistoryState {
  if (!patches.length) return history

  const forward = [...patches]
  const backward = patches.map(invertDocumentPatch).reverse()
  const size = patches.reduce((total, patch) => total + documentPatchSize(patch), 0)
  const previousEntry = history.past.at(-1)
  const shouldCoalesce =
    previousEntry?.group === group &&
    timestamp - previousEntry.timestamp <= DOCUMENT_HISTORY_COALESCE_MS

  const nextPast = shouldCoalesce
    ? [
        ...history.past.slice(0, -1),
        {
          forward: [...previousEntry.forward, ...forward],
          backward: [...backward, ...previousEntry.backward],
          group,
          timestamp,
          size: previousEntry.size + size,
        },
      ]
    : [...history.past, { forward, backward, group, timestamp, size }]
  const trimmed = trimHistory(nextPast)
  return { past: trimmed.entries, future: [], size: trimmed.size }
}

function applyPatches(content: string, patches: readonly DocumentPatch[]) {
  let nextContent = content
  for (const patch of patches) {
    const next = applyDocumentPatch(nextContent, patch)
    if (next === null) return null
    nextContent = next
  }
  return nextContent
}

export function undoDocumentHistory(history: DocumentHistoryState, currentContent: string) {
  const entry = history.past.at(-1)
  if (!entry) return null
  const nextContent = applyPatches(currentContent, entry.backward)
  if (nextContent === null) return null

  return {
    nextContent,
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future],
      size: Math.max((history.size ?? 0) - entry.size, 0),
    },
  }
}

export function redoDocumentHistory(history: DocumentHistoryState, currentContent: string) {
  const [entry, ...remainingFuture] = history.future
  if (!entry) return null
  const nextContent = applyPatches(currentContent, entry.forward)
  if (nextContent === null) return null
  const trimmed = trimHistory([...history.past, entry])

  return {
    nextContent,
    history: {
      past: trimmed.entries,
      future: remainingFuture,
      size: trimmed.size,
    },
  }
}
