import { nextDocumentRevision, type DocumentRevision } from '../document'
import type { EditorMode, OpenDocument } from './documentState'
import { applyDocumentPatch, type DocumentPatch } from './documentPatch'
import type { LogicalSelectionAnchor } from '../markdown/blockDocument'

export type EditorViewId = string

export type DocumentUpdateKind = 'source-edit' | 'visual-edit' | 'undo' | 'redo'

export type DocumentTransaction = {
  documentId: string
  originViewId: EditorViewId
  baseRevision: DocumentRevision
  patches: DocumentPatch[]
  selection?: {
    anchor: LogicalSelectionAnchor | null
    head: LogicalSelectionAnchor | null
  }
  updateKind: DocumentUpdateKind
  historyGroup?: string
}

export type DocumentUpdate = DocumentTransaction

export type EditorViewSession = {
  id: EditorViewId
  documentId: string
  paneId: 'left' | 'right'
  mode: EditorMode
  scrollTop: number
  selectionState: unknown | null
  logicalSelection: {
    anchor: LogicalSelectionAnchor | null
    head: LogicalSelectionAnchor | null
  } | null
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
    logicalSelection: null,
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

  let nextContent = document.content
  for (const patch of update.patches) {
    const patched = applyDocumentPatch(nextContent, patch)
    if (patched === null) return null
    nextContent = patched
  }

  if (nextContent === document.content) {
    return {
      nextRevision: document.revision,
      nextContent: document.content,
    }
  }

  return {
    nextRevision: nextDocumentRevision(document.revision),
    nextContent,
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
