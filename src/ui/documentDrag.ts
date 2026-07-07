import type { EditorPane } from '../application/types/shell'

export const documentDragMimeType = 'application/x-folden-drag'

export type DocumentDragPayload =
  | {
      kind: 'tab' | 'open-editor'
      documentId: string
      paneId: EditorPane['id']
      label?: string
    }
  | {
      kind: 'workspace-file'
      path: string
      label: string
    }
  | {
      kind: 'external-path'
      path: string
      label: string
    }

function isDocumentDragPayload(value: unknown): value is DocumentDragPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<DocumentDragPayload>

  if (candidate.kind === 'tab' || candidate.kind === 'open-editor') {
    return typeof candidate.documentId === 'string'
      && candidate.documentId.trim().length > 0
      && (candidate.paneId === 'left' || candidate.paneId === 'right')
      && (candidate.label === undefined || typeof candidate.label === 'string')
  }

  return (candidate.kind === 'workspace-file' || candidate.kind === 'external-path')
    && typeof candidate.path === 'string'
    && candidate.path.trim().length > 0
    && typeof candidate.label === 'string'
    && candidate.label.trim().length > 0
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
  event.dataTransfer?.setData('text/plain', dragPayloadLabel(payload))

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
    applyDragPreview(event, dragPayloadLabel(payload))
  }
}

function dragPayloadLabel(payload: DocumentDragPayload): string {
  if (payload.kind === 'tab' || payload.kind === 'open-editor') {
    return payload.label ?? payload.documentId
  }

  return payload.kind === 'workspace-file' || payload.kind === 'external-path'
    ? payload.label
    : payload.documentId
}

function applyDragPreview(event: DragEvent, label: string) {
  const preview = document.createElement('div')
  preview.className = 'drag-preview'
  preview.textContent = label
  preview.style.position = 'fixed'
  preview.style.top = '-1000px'
  preview.style.left = '-1000px'
  document.body.append(preview)
  event.dataTransfer?.setDragImage(preview, 12, 12)
  window.setTimeout(() => preview.remove())
}
