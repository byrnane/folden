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
}

export type WindowCloseDecision = 'clean' | 'save' | 'discard' | 'cancel'
