import type { WorkspaceEntry } from '../../domain/native'
import type { EditorMode, OpenDocument } from '../../domain/documents/documentState'

export type Workspace = {
  id: string
  rootPath: string
  name: string
  entries: WorkspaceEntry[]
}

export type EditorPane = {
  id: 'left' | 'right'
  title: string
  documentIds: string[]
  activeDocumentId: string | null
}

export type EditorPaneTabView = {
  document: OpenDocument
  title: string
  isActive: boolean
  isDirty: boolean
}

export type EditorPaneActiveDocumentView = {
  document: OpenDocument
  mode: EditorMode
  viewSessionId: string
  shouldLoadRemoteImages: boolean
}

export type EditorPaneView = EditorPane & {
  tabs: EditorPaneTabView[]
  activeDocument: EditorPaneActiveDocumentView | null
}

export type EditorAdapter = {
  flushContent: () => string
  runVisualCommand?: (command: VisualEditorCommand) => void
}

export type VisualEditorCommand =
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'clear-formatting'
  | 'bullet-list'
  | 'ordered-list'
  | 'quote'
  | 'code-block'
  | 'link'
  | 'image'
  | 'horizontal-rule'

export type WindowCloseDecision = 'clean' | 'save' | 'discard' | 'cancel'
