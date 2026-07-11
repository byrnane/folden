export type DocumentHistoryEntry = {
  content: string
}

export type DocumentHistoryState = {
  past: DocumentHistoryEntry[]
  future: DocumentHistoryEntry[]
}

const DOCUMENT_HISTORY_LIMIT = 100

export function createDocumentHistoryState(): DocumentHistoryState {
  // Task 6 prototype result: bounded shared snapshots are viable for the current 0.3 string model.
  return {
    past: [],
    future: [],
  }
}

export function recordDocumentHistory(
  history: DocumentHistoryState,
  currentContent: string,
): DocumentHistoryState {
  const nextPast = [...history.past, { content: currentContent }].slice(-DOCUMENT_HISTORY_LIMIT)

  return {
    past: nextPast,
    future: [],
  }
}

export function undoDocumentHistory(history: DocumentHistoryState, currentContent: string) {
  const previousEntry = history.past.at(-1)

  if (!previousEntry) {
    return null
  }

  return {
    nextContent: previousEntry.content,
    history: {
      past: history.past.slice(0, -1),
      future: [{ content: currentContent }, ...history.future].slice(0, DOCUMENT_HISTORY_LIMIT),
    },
  }
}

export function redoDocumentHistory(history: DocumentHistoryState, currentContent: string) {
  const [nextEntry, ...remainingFuture] = history.future

  if (!nextEntry) {
    return null
  }

  return {
    nextContent: nextEntry.content,
    history: {
      past: [...history.past, { content: currentContent }].slice(-DOCUMENT_HISTORY_LIMIT),
      future: remainingFuture,
    },
  }
}
