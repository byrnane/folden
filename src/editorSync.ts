import { nextDocumentRevision, type DocumentRevision } from './domain/document'
import type { EditorMode, OpenDocument } from './documentState'

export type EditorViewId = string

export type DocumentUpdateKind = 'source-edit' | 'visual-edit' | 'undo' | 'redo'

export type DocumentUpdate = {
  documentId: string
  originViewId: EditorViewId
  baseRevision: DocumentRevision
  nextContent: string
  updateKind: DocumentUpdateKind
}

export type EditorViewSession = {
  id: EditorViewId
  documentId: string
  paneId: 'left' | 'right'
  mode: EditorMode
  scrollTop: number
  selectionState: unknown | null
  lastAppliedRevision: DocumentRevision
  isFocused: boolean
}

export function createEditorViewSession(
  document: OpenDocument,
  paneId: 'left' | 'right',
  mode: EditorMode,
): EditorViewSession {
  return {
    id: `${paneId}:${document.id}`,
    documentId: document.id,
    paneId,
    mode,
    scrollTop: 0,
    selectionState: null,
    lastAppliedRevision: document.revision,
    isFocused: false,
  }
}

export function acceptDocumentUpdate(document: OpenDocument, update: DocumentUpdate) {
  if (update.documentId !== document.id) {
    return null
  }

  if (update.baseRevision !== document.revision) {
    return null
  }

  if (update.nextContent === document.content) {
    return {
      nextRevision: document.revision,
      nextContent: document.content,
    }
  }

  return {
    nextRevision: nextDocumentRevision(document.revision),
    nextContent: update.nextContent,
  }
}

export function getSynchronizedSessionIds(
  sessions: EditorViewSession[],
  documentId: string,
  originViewId: EditorViewId,
) {
  return sessions
    .filter((session) => session.documentId === documentId && session.id !== originViewId)
    .map((session) => session.id)
}
