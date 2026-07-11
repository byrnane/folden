import { computed, readonly, ref } from 'vue'
import {
  acceptDocumentUpdate,
  getSynchronizedSessionIds,
  type DocumentUpdate,
} from '../../domain/documents/editorSync'
import { createEditorViewSession, type EditorViewSession } from '../../domain/documents/editorSync'
import type { EditorMode, OpenDocument } from '../../domain/documents/documentState'
import type { EditorAdapter, EditorPane } from '../types/shell'

type PaneLayoutRecord = {
  id: EditorPane['id']
  documentIds: string[]
  activeDocumentId: string | null
}

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

  const activePane = computed(() => getPane(activePaneId.value) ?? panes.value[0])

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
    return (
      paneDocumentModes.value[paneDocumentModeKey(pane.id, document.id)] ?? document.defaultMode
    )
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
    return (
      viewSessions.value[paneDocumentModeKey(pane.id, document.id)]?.id ??
      paneDocumentModeKey(pane.id, document.id)
    )
  }

  function getViewSession(pane: EditorPane, document: OpenDocument) {
    return ensureViewSession(pane, document)
  }

  function updateEditorViewSession(
    paneId: EditorPane['id'],
    documentId: string,
    viewState: Partial<Pick<EditorViewSession, 'scrollTop' | 'selectionState' | 'isFocused'>>,
  ) {
    const sessionId = paneDocumentModeKey(paneId, documentId)
    const session = viewSessions.value[sessionId]

    if (!session) {
      return
    }

    viewSessions.value = {
      ...viewSessions.value,
      [sessionId]: {
        ...session,
        ...viewState,
      },
    }
  }

  function setActiveDocument(pane: EditorPane, documentId: string) {
    setActiveDocumentInPane(pane.id, documentId)
  }

  function setActiveDocumentInPane(paneId: EditorPane['id'], documentId: string) {
    const pane = getPane(paneId)

    if (!pane || !pane.documentIds.includes(documentId)) {
      return
    }

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

  function setDocumentMode(paneId: EditorPane['id'], document: OpenDocument, mode: EditorMode) {
    const pane = getPane(paneId)

    if (!pane) {
      return
    }

    ensureViewSession(pane, document)
    paneDocumentModes.value = {
      ...paneDocumentModes.value,
      [paneDocumentModeKey(pane.id, document.id)]: mode,
    }
  }

  function setOpenDocumentMode(documentId: string, mode: EditorMode) {
    const nextModes = { ...paneDocumentModes.value }

    for (const pane of panes.value) {
      if (pane.documentIds.includes(documentId)) {
        nextModes[paneDocumentModeKey(pane.id, documentId)] = mode
      }
    }

    paneDocumentModes.value = nextModes
  }

  function addDocumentToPane(document: OpenDocument, paneId = activePaneId.value) {
    const pane = getPane(paneId)

    if (!pane) {
      return null
    }

    if (pane.id === 'right') {
      splitEnabled.value = true
    }

    if (!pane.documentIds.includes(document.id)) {
      pane.documentIds.push(document.id)
    }

    ensureViewSession(pane, document)
    setActiveDocumentInPane(pane.id, document.id)
    return pane
  }

  function updateDocumentSessions(documentId: string, revision: number) {
    const nextSessions = { ...viewSessions.value }

    for (const [sessionId, session] of Object.entries(nextSessions)) {
      if (session.documentId !== documentId) {
        continue
      }

      nextSessions[sessionId] = {
        ...session,
        lastAppliedRevision: revision,
      }
    }

    viewSessions.value = nextSessions
  }

  function applyDocumentUpdateToSessions(
    update: DocumentUpdate,
    document: OpenDocument,
    applyDocumentUpdate: (
      documentId: string,
      baseRevision: number,
      nextContent: string,
    ) => OpenDocument | null,
  ) {
    const acceptedUpdate = acceptDocumentUpdate(document, update)

    if (!acceptedUpdate) {
      return null
    }

    const nextDocument = applyDocumentUpdate(
      document.id,
      update.baseRevision,
      acceptedUpdate.nextContent,
    )

    if (!nextDocument) {
      return null
    }

    const sessionIds = [
      update.originViewId,
      ...getSynchronizedSessionIds(
        Object.values(viewSessions.value),
        document.id,
        update.originViewId,
      ),
    ]
    const nextSessions = { ...viewSessions.value }

    for (const sessionId of sessionIds) {
      const session = nextSessions[sessionId]

      if (!session) {
        continue
      }

      nextSessions[sessionId] = {
        ...session,
        lastAppliedRevision: nextDocument.revision,
      }
    }

    viewSessions.value = nextSessions
    return nextDocument
  }

  function setSplitEnabled(enabled: boolean) {
    if (enabled) {
      splitEnabled.value = true
      return
    }

    mergeRightPaneIntoLeft()
    splitEnabled.value = false
    activePaneId.value = 'left'
  }

  function mergeRightPaneIntoLeft() {
    const leftPane = getPane('left')
    const rightPane = getPane('right')
    const nextPaneDocumentModes = { ...paneDocumentModes.value }

    if (!leftPane || !rightPane) {
      return
    }

    for (const documentId of rightPane.documentIds) {
      if (!leftPane.documentIds.includes(documentId)) {
        leftPane.documentIds.push(documentId)
      }

      const rightMode = paneDocumentModes.value[paneDocumentModeKey('right', documentId)]

      if (rightMode) {
        nextPaneDocumentModes[paneDocumentModeKey('left', documentId)] = rightMode
      }

      delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
    }

    if (rightPane.activeDocumentId) {
      leftPane.activeDocumentId = rightPane.activeDocumentId
    } else if (!leftPane.activeDocumentId) {
      leftPane.activeDocumentId = leftPane.documentIds.at(-1) ?? null
    }

    rightPane.documentIds = []
    rightPane.activeDocumentId = null
    paneDocumentModes.value = nextPaneDocumentModes
  }

  function moveDocumentToPane(
    document: OpenDocument,
    sourcePaneId: EditorPane['id'],
    targetPaneId: EditorPane['id'],
  ) {
    if (sourcePaneId === targetPaneId) {
      addDocumentToPane(document, targetPaneId)
      return
    }

    setSplitEnabled(true)
    addDocumentToPane(document, targetPaneId)
    removeDocumentFromPane(sourcePaneId, document.id, false)
  }

  function moveDocumentIdToPane(
    documentId: string,
    sourcePaneId: EditorPane['id'],
    targetPaneId: EditorPane['id'],
    targetIndex?: number,
  ) {
    const sourcePane = getPane(sourcePaneId)
    const targetPane = getPane(targetPaneId)

    if (!sourcePane || !targetPane || !sourcePane.documentIds.includes(documentId)) {
      return
    }

    if (targetPaneId === 'right') {
      setSplitEnabled(true)
    }

    sourcePane.documentIds = sourcePane.documentIds.filter((id) => id !== documentId)

    const currentTargetIds = targetPane.documentIds.filter((id) => id !== documentId)
    const insertIndex =
      typeof targetIndex === 'number'
        ? Math.min(Math.max(targetIndex, 0), currentTargetIds.length)
        : currentTargetIds.length

    currentTargetIds.splice(insertIndex, 0, documentId)
    targetPane.documentIds = currentTargetIds
    targetPane.activeDocumentId = documentId

    if (sourcePane.activeDocumentId === documentId) {
      sourcePane.activeDocumentId = sourcePane.documentIds.at(-1) ?? null
    }

    activePaneId.value = targetPaneId
    normalizePaneState()
  }

  function reorderDocumentInPane(
    paneId: EditorPane['id'],
    documentId: string,
    targetIndex: number,
  ) {
    const pane = getPane(paneId)

    if (!pane || !pane.documentIds.includes(documentId)) {
      return
    }

    const currentIds = pane.documentIds.filter((id) => id !== documentId)
    const insertIndex = Math.min(Math.max(targetIndex, 0), currentIds.length)

    currentIds.splice(insertIndex, 0, documentId)
    pane.documentIds = currentIds
    pane.activeDocumentId = documentId
    activePaneId.value = paneId
  }

  function normalizePaneState() {
    if (splitEnabled.value && panes.value[1].documentIds.length === 0) {
      setSplitEnabled(false)
    }

    const currentActivePane = getPane(activePaneId.value)

    if (currentActivePane?.documentIds.length) {
      return
    }

    if (panes.value[0].documentIds.length) {
      activePaneId.value = 'left'
      return
    }

    if (splitEnabled.value && panes.value[1].documentIds.length) {
      activePaneId.value = 'right'
    }
  }

  function removeDocumentFromPane(
    paneId: EditorPane['id'],
    documentId: string,
    removeOrphanedDocument = true,
  ) {
    const pane = getPane(paneId)

    if (!pane) {
      return { removedDocumentIds: [] as string[] }
    }

    pane.documentIds = pane.documentIds.filter((id) => id !== documentId)

    if (pane.activeDocumentId === documentId) {
      pane.activeDocumentId = pane.documentIds.at(-1) ?? null
    }

    const removedDocumentIds =
      removeOrphanedDocument && !isDocumentOpen(documentId) ? [documentId] : []
    removePaneRecords([documentId], paneId, removedDocumentIds.length > 0)
    normalizePaneState()
    return { removedDocumentIds }
  }

  function removeDocumentsFromPanes(documentIds: string[]) {
    if (!documentIds.length) {
      return { removedDocumentIds: [] as string[] }
    }

    const documentIdSet = new Set(documentIds)

    for (const pane of panes.value) {
      pane.documentIds = pane.documentIds.filter((documentId) => !documentIdSet.has(documentId))

      if (pane.activeDocumentId && documentIdSet.has(pane.activeDocumentId)) {
        pane.activeDocumentId = pane.documentIds.at(-1) ?? null
      }
    }

    removePaneRecords(documentIds, undefined, true)
    normalizePaneState()
    return { removedDocumentIds: documentIds }
  }

  function removePaneRecords(
    documentIds: string[],
    paneId?: EditorPane['id'],
    allPaneRecords = false,
  ) {
    const nextPaneDocumentModes = { ...paneDocumentModes.value }
    const nextViewSessions = { ...viewSessions.value }
    const paneIds: EditorPane['id'][] = allPaneRecords
      ? panes.value.map((pane) => pane.id)
      : paneId
        ? [paneId]
        : []

    for (const documentId of documentIds) {
      for (const currentPaneId of paneIds) {
        delete nextPaneDocumentModes[paneDocumentModeKey(currentPaneId, documentId)]
        delete nextViewSessions[paneDocumentModeKey(currentPaneId, documentId)]
      }
    }

    paneDocumentModes.value = nextPaneDocumentModes
    viewSessions.value = nextViewSessions
  }

  function isDocumentOpen(documentId: string) {
    return panes.value.some((pane) => pane.documentIds.includes(documentId))
  }

  function clearLayout() {
    panes.value = [
      {
        id: 'left',
        title: 'Main',
        documentIds: [],
        activeDocumentId: null,
      },
      {
        id: 'right',
        title: 'Split',
        documentIds: [],
        activeDocumentId: null,
      },
    ]
    activePaneId.value = 'left'
    splitEnabled.value = false
    paneDocumentModes.value = {}
    viewSessions.value = {}
  }

  function setFallbackDocument(document: OpenDocument) {
    clearLayout()
    panes.value[0].documentIds = [document.id]
    panes.value[0].activeDocumentId = document.id
    paneDocumentModes.value = {
      [paneDocumentModeKey('left', document.id)]: document.defaultMode,
    }
    ensureViewSession(panes.value[0], document)
  }

  function restoreLayout(
    layout: PaneLayoutRecord[],
    modeEntries: Record<string, EditorMode>,
    nextSplitEnabled: boolean,
    nextActivePaneId: EditorPane['id'],
    getDocument: (documentId: string) => OpenDocument | null,
  ) {
    for (const pane of panes.value) {
      pane.documentIds = []
      pane.activeDocumentId = null
    }

    for (const paneRecord of layout) {
      const pane = getPane(paneRecord.id)

      if (!pane) {
        continue
      }

      pane.documentIds = [...paneRecord.documentIds]
      pane.activeDocumentId = paneRecord.activeDocumentId ?? pane.documentIds.at(-1) ?? null
    }

    const paneDocumentIds = new Set(panes.value.flatMap((pane) => pane.documentIds))
    paneDocumentModes.value = { ...modeEntries }
    splitEnabled.value = nextSplitEnabled && panes.value[1].documentIds.length > 0
    activePaneId.value = getPane(nextActivePaneId)?.documentIds.length ? nextActivePaneId : 'left'
    viewSessions.value = {}

    for (const pane of panes.value) {
      for (const documentId of pane.documentIds) {
        const document = getDocument(documentId)

        if (document) {
          ensureViewSession(pane, document)
        }
      }
    }

    return paneDocumentIds
  }

  function getPaneSnapshot() {
    return panes.value.map((pane) => ({
      id: pane.id,
      title: pane.title,
      documentIds: [...pane.documentIds],
      activeDocumentId: pane.activeDocumentId,
    }))
  }

  return {
    panes: readonly(panes),
    activePaneId: readonly(activePaneId),
    splitEnabled: readonly(splitEnabled),
    paneDocumentModes: readonly(paneDocumentModes),
    viewSessions: readonly(viewSessions),
    paneEditors: readonly(paneEditors),
    visiblePanes,
    activePane,
    getPane,
    setActivePane,
    paneDocumentModeKey,
    getDocumentMode,
    ensureViewSession,
    getViewSession,
    getViewSessionId,
    updateEditorViewSession,
    setActiveDocument,
    setActiveDocumentInPane,
    setPaneEditorAdapter,
    setDocumentMode,
    setOpenDocumentMode,
    addDocumentToPane,
    applyDocumentUpdateToSessions,
    updateDocumentSessions,
    setSplitEnabled,
    mergeRightPaneIntoLeft,
    moveDocumentToPane,
    moveDocumentIdToPane,
    reorderDocumentInPane,
    normalizePaneState,
    removeDocumentFromPane,
    removeDocumentsFromPanes,
    clearLayout,
    setFallbackDocument,
    restoreLayout,
    getPaneSnapshot,
  }
}
