import type { WorkspaceEntry } from '../../domain/native'

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
