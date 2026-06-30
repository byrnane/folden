import { computed, ref } from 'vue'
import {
  createEditorViewSession,
  type EditorViewSession,
} from '../../domain/documents/editorSync'
import type { EditorMode, OpenDocument } from '../../domain/documents/documentState'
import type { EditorAdapter, EditorPane } from '../types/shell'

export function createPaneController(initialDocument: OpenDocument) {
  const panes = ref<EditorPane[]>([
    {
      id: 'left',
      title: 'Main',
      documentIds: [initialDocument.id],
      activeDocumentId: initialDocument.id,
    },
    {
      id: 'right',
      title: 'Split',
      documentIds: [],
      activeDocumentId: null,
    },
  ])
  const activePaneId = ref<EditorPane['id']>('left')
  const splitEnabled = ref(false)
  const paneDocumentModes = ref<Record<string, EditorMode>>({})
  const viewSessions = ref<Record<string, EditorViewSession>>({
    [paneDocumentModeKey('left', initialDocument.id)]: createEditorViewSession(
      initialDocument,
      'left',
      initialDocument.defaultMode,
    ),
  })
  const paneEditors = ref<Partial<Record<EditorPane['id'], EditorAdapter | null>>>({})

  const visiblePanes = computed(() =>
    splitEnabled.value ? panes.value : panes.value.filter((pane) => pane.id === 'left'),
  )

  function getPane(id: EditorPane['id']) {
    return panes.value.find((pane) => pane.id === id) ?? null
  }

  function setActivePane(paneId: EditorPane['id']) {
    activePaneId.value = paneId
  }

  function paneDocumentModeKey(paneId: EditorPane['id'], documentId: string) {
    return `${paneId}:${documentId}`
  }

  function getDocumentMode(pane: EditorPane, document: OpenDocument) {
    return paneDocumentModes.value[paneDocumentModeKey(pane.id, document.id)] ?? document.defaultMode
  }

  function ensureViewSession(pane: EditorPane, document: OpenDocument) {
    const mode = getDocumentMode(pane, document)
    const sessionId = paneDocumentModeKey(pane.id, document.id)
    const existingSession = viewSessions.value[sessionId]

    if (existingSession) {
      existingSession.mode = mode
      existingSession.lastAppliedRevision = document.revision
      return existingSession
    }

    const session = createEditorViewSession(document, pane.id, mode)
    viewSessions.value = {
      ...viewSessions.value,
      [sessionId]: session,
    }

    return session
  }

  function getViewSessionId(pane: EditorPane, document: OpenDocument) {
    return viewSessions.value[paneDocumentModeKey(pane.id, document.id)]?.id
      ?? paneDocumentModeKey(pane.id, document.id)
  }

  function setActiveDocument(pane: EditorPane, documentId: string) {
    pane.activeDocumentId = documentId
    activePaneId.value = pane.id
  }

  function setPaneEditorAdapter(paneId: EditorPane['id'], adapter: EditorAdapter | null) {
    if (paneEditors.value[paneId] === adapter) {
      return
    }

    paneEditors.value = {
      ...paneEditors.value,
      [paneId]: adapter,
    }
  }

  return {
    panes,
    activePaneId,
    splitEnabled,
    paneDocumentModes,
    viewSessions,
    paneEditors,
    visiblePanes,
    getPane,
    setActivePane,
    paneDocumentModeKey,
    getDocumentMode,
    ensureViewSession,
    getViewSessionId,
    setActiveDocument,
    setPaneEditorAdapter,
  }
}
