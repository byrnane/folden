import type { EditorPane } from '../application/types/shell'

export const documentDragMimeType = 'application/x-folden-drag'

export type DocumentDragPayload = {
  kind: 'tab' | 'open-editor'
  documentId: string
  paneId: EditorPane['id']
}

function isDocumentDragPayload(value: unknown): value is DocumentDragPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<DocumentDragPayload>

  return (candidate.kind === 'tab' || candidate.kind === 'open-editor')
    && typeof candidate.documentId === 'string'
    && candidate.documentId.trim().length > 0
    && (candidate.paneId === 'left' || candidate.paneId === 'right')
}

export function parseDocumentDragPayload(rawValue: unknown) {
  if (typeof rawValue !== 'string' || !rawValue) {
    return null
  }

  try {
    const payload = JSON.parse(rawValue)
    return isDocumentDragPayload(payload) ? payload : null
  } catch {
    return null
  }
}

export function readDocumentDragPayload(event: DragEvent) {
  return parseDocumentDragPayload(event.dataTransfer?.getData(documentDragMimeType))
}

export function startDocumentDrag(event: DragEvent, payload: DocumentDragPayload) {
  event.dataTransfer?.setData(documentDragMimeType, JSON.stringify(payload))
  event.dataTransfer?.setData('text/plain', payload.documentId)

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
  }
}
