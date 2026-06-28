export type ClosePaneSnapshot = {
  documentIds: string[]
}

export function countOpenDocumentViews(
  panes: readonly ClosePaneSnapshot[],
  documentId: string,
) {
  return panes.reduce((count, pane) => (
    count + (pane.documentIds.includes(documentId) ? 1 : 0)
  ), 0)
}

export function shouldPromptToDiscardDocument(
  panes: readonly ClosePaneSnapshot[],
  documentId: string,
  isDirty: boolean,
) {
  if (!isDirty) {
    return false
  }

  return countOpenDocumentViews(panes, documentId) <= 1
}
