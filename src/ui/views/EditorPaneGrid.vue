<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import type { OpenDocument, EditorMode } from '../../domain/documents/documentState'
import type { ApplicationSettings } from '../../infrastructure/settings/settings'
import type { EditorAdapter, EditorPane } from '../../application/types/shell'
import SourceEditor from '../editors/SourceEditor.vue'
import VisualMarkdownEditor from '../editors/VisualMarkdownEditor.vue'
import {
  readDocumentDragPayload,
  startDocumentDrag,
  type DocumentDragPayload,
} from '../documentDrag'
import { uiIconSizes } from '../uiConstants'

const tabPointerDragStartDistancePx = 5

const props = defineProps<{
  visiblePanes: EditorPane[]
  activePaneId: EditorPane['id']
  splitEnabled: boolean
  splitRatio: number
  appSettings: ApplicationSettings
  workspaceRootPath: string | null
  cleanDisplayPath: (path: string) => string
  closeDocument: (pane: EditorPane, documentId: string) => void | Promise<void>
  getDocument: (documentId: string) => OpenDocument | null
  getDocumentMode: (pane: EditorPane, document: OpenDocument) => EditorMode
  getViewSessionId: (pane: EditorPane, document: OpenDocument) => string
  isDirty: (document: OpenDocument) => boolean
  openDroppedPath: (path: string, paneId: EditorPane['id']) => void | Promise<void>
  setActiveDocument: (pane: EditorPane, documentId: string) => void | Promise<void>
  setPaneEditorAdapter: (paneId: EditorPane['id'], adapter: EditorAdapter | null) => void
  shouldLoadRemoteImages: (document: OpenDocument) => boolean
}>()

const emit = defineEmits<{
  beginSplitResize: [event: MouseEvent]
  documentUpdate: [update: DocumentUpdate]
  moveDocumentBetweenPanes: [
    documentId: string,
    sourcePaneId: EditorPane['id'],
    targetPaneId: EditorPane['id'],
    targetIndex?: number,
  ]
  keyboardSplitResize: [event: KeyboardEvent]
  reorderDocumentInPane: [paneId: EditorPane['id'], documentId: string, targetIndex: number]
  resetLayout: []
  setActivePane: [paneId: EditorPane['id']]
}>()

type TabPointerDrag = {
  documentId: string
  sourcePaneId: EditorPane['id']
  startX: number
  startY: number
  dragging: boolean
}

const tabPointerDrag = ref<TabPointerDrag | null>(null)
const suppressNextTabClick = ref(false)

function handleDocumentDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function getDroppedPath(event: DragEvent) {
  const file = event.dataTransfer?.files.item(0) as (File & {
    path?: string
  }) | null

  return file?.path ?? file?.webkitRelativePath ?? null
}

function moveDroppedDocument(
  payload: DocumentDragPayload,
  targetPaneId: EditorPane['id'],
  targetIndex?: number,
) {
  if (payload.kind === 'tab' && payload.paneId === targetPaneId && targetIndex !== undefined) {
    emit('reorderDocumentInPane', targetPaneId, payload.documentId, targetIndex)
    return
  }

  emit('moveDocumentBetweenPanes', payload.documentId, payload.paneId, targetPaneId, targetIndex)
}

function openDroppedFile(event: DragEvent, targetPaneId: EditorPane['id']) {
  const droppedPath = getDroppedPath(event)

  if (!droppedPath) {
    return
  }

  event.preventDefault()
  void props.openDroppedPath(droppedPath, targetPaneId)
}

function handlePaneDrop(event: DragEvent, targetPaneId: EditorPane['id']) {
  const payload = readDocumentDragPayload(event)

  if (!payload) {
    openDroppedFile(event, targetPaneId)
    return
  }

  event.preventDefault()
  event.stopPropagation()
  moveDroppedDocument(payload, targetPaneId)
}

function handleTabDrop(event: DragEvent, targetPaneId: EditorPane['id'], targetIndex: number) {
  const payload = readDocumentDragPayload(event)

  if (!payload) {
    openDroppedFile(event, targetPaneId)
    return
  }

  event.preventDefault()
  event.stopPropagation()
  moveDroppedDocument(payload, targetPaneId, targetIndex)
}

function handleTabListDrop(event: DragEvent, targetPaneId: EditorPane['id']) {
  const pane = props.visiblePanes.find((candidate) => candidate.id === targetPaneId)
  handleTabDrop(event, targetPaneId, pane?.documentIds.length ?? 0)
}

function beginTabPointerDrag(event: PointerEvent, documentId: string, sourcePaneId: EditorPane['id']) {
  if (event.button !== 0) {
    return
  }

  tabPointerDrag.value = {
    documentId,
    sourcePaneId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
  }
}

function getTabDropTarget(event: PointerEvent) {
  const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
  const tabTarget = target?.closest<HTMLElement>('[data-tab-drop-pane]')
  const paneTarget = target?.closest<HTMLElement>('[data-pane-id]')
  const paneId = (tabTarget?.dataset.tabDropPane ?? paneTarget?.dataset.paneId) as EditorPane['id'] | undefined

  if (paneId !== 'left' && paneId !== 'right') {
    return null
  }

  const pane = props.visiblePanes.find((candidate) => candidate.id === paneId)
  const fallbackIndex = pane?.documentIds.length ?? 0
  const rawIndex = tabTarget?.dataset.tabDropIndex
  const targetIndex = rawIndex === undefined ? fallbackIndex : Number(rawIndex)

  return {
    paneId,
    targetIndex: Number.isFinite(targetIndex) ? targetIndex : fallbackIndex,
  }
}

function handleTabPointerMove(event: PointerEvent) {
  const drag = tabPointerDrag.value

  if (!drag) {
    return
  }

  if (
    !drag.dragging
    && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < tabPointerDragStartDistancePx
  ) {
    return
  }

  drag.dragging = true
  event.preventDefault()
}

function finishTabPointerDrag(event: PointerEvent) {
  const drag = tabPointerDrag.value
  tabPointerDrag.value = null

  if (!drag?.dragging) {
    return
  }

  suppressNextTabClick.value = true
  const target = getTabDropTarget(event)

  if (!target) {
    return
  }

  moveDroppedDocument({
    kind: 'tab',
    documentId: drag.documentId,
    paneId: drag.sourcePaneId,
  }, target.paneId, target.targetIndex)
}

function handleTabClick(pane: EditorPane, documentId: string) {
  if (suppressNextTabClick.value) {
    suppressNextTabClick.value = false
    return
  }

  void props.setActiveDocument(pane, documentId)
}

function closeTabOnAuxClick(event: MouseEvent, pane: EditorPane, documentId: string) {
  if (event.button === 1) {
    void props.closeDocument(pane, documentId)
  }
}
</script>

<template>
  <section
    class="pane-grid"
    :class="{ split: splitEnabled }"
  >
    <section
      v-for="pane in visiblePanes"
      :key="pane.id"
      class="editor-pane"
      :data-pane-id="pane.id"
      :class="{ active: activePaneId === pane.id }"
      @click="emit('setActivePane', pane.id)"
      @dragover.prevent="handleDocumentDragOver"
      @drop="handlePaneDrop($event, pane.id)"
    >
      <header class="pane-header">
        <div
          class="pane-tabs"
          @dragover.prevent.stop="handleDocumentDragOver"
          @drop.stop="handleTabListDrop($event, pane.id)"
        >
          <button
            v-for="(documentId, index) in pane.documentIds"
            :key="documentId"
            type="button"
            class="tab-button"
            :data-tab-drop-pane="pane.id"
            :data-tab-drop-index="index"
            :class="{ active: pane.activeDocumentId === documentId }"
            :title="getDocument(documentId)?.path ? cleanDisplayPath(getDocument(documentId)!.path!) : 'Scratch document'"
            draggable="true"
            @dragstart="startDocumentDrag($event, {
              kind: 'tab',
              documentId,
              paneId: pane.id,
            })"
            @dragover.prevent.stop="handleDocumentDragOver"
            @drop.stop="handleTabDrop($event, pane.id, index)"
            @pointerdown="beginTabPointerDrag($event, documentId, pane.id)"
            @pointermove="handleTabPointerMove"
            @pointerup="finishTabPointerDrag"
            @pointercancel="tabPointerDrag = null"
            @auxclick.stop="closeTabOnAuxClick($event, pane, documentId)"
            @click.stop="handleTabClick(pane, documentId)"
          >
            <span>{{ getDocument(documentId)?.name ?? 'Missing' }}</span>
            <span v-if="getDocument(documentId) && isDirty(getDocument(documentId)!)" class="tab-dot" />
            <X
              class="tab-close"
              :size="uiIconSizes.tabClose"
              @pointerdown.stop
              @click.stop="closeDocument(pane, documentId)"
            />
          </button>
          <span
            class="tab-drop-tail"
            :data-tab-drop-pane="pane.id"
            :data-tab-drop-index="pane.documentIds.length"
            @dragover.prevent.stop="handleDocumentDragOver"
            @drop.stop="handleTabDrop($event, pane.id, pane.documentIds.length)"
          />
        </div>
      </header>

      <template v-if="pane.activeDocumentId && getDocument(pane.activeDocumentId)">
        <VisualMarkdownEditor
          v-if="getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual'"
          :key="`${getViewSessionId(pane, getDocument(pane.activeDocumentId)!)}:${shouldLoadRemoteImages(getDocument(pane.activeDocumentId)! ) ? 'remote-on' : 'remote-off'}`"
          :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
          :document-id="getDocument(pane.activeDocumentId)!.id"
          :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
          :model-value="getDocument(pane.activeDocumentId)!.content"
          :revision="getDocument(pane.activeDocumentId)!.revision"
          :document-path="getDocument(pane.activeDocumentId)!.path"
          :workspace-root-path="workspaceRootPath"
          :allow-remote-images="shouldLoadRemoteImages(getDocument(pane.activeDocumentId)!)"
          @document-update="emit('documentUpdate', $event)"
        />
        <section v-else class="source-editor-frame">
          <SourceEditor
            :key="`${getViewSessionId(pane, getDocument(pane.activeDocumentId)!)}:${appSettings.editor.wordWrap ? 'wrap' : 'nowrap'}`"
            :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
            :document-id="getDocument(pane.activeDocumentId)!.id"
            :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
            :model-value="getDocument(pane.activeDocumentId)!.content"
            :revision="getDocument(pane.activeDocumentId)!.revision"
            :word-wrap="appSettings.editor.wordWrap"
            @document-update="emit('documentUpdate', $event)"
          />
        </section>
      </template>

      <div v-else class="empty-pane">
        <p>No open file in this pane.</p>
      </div>
    </section>
    <div
      v-if="splitEnabled"
      class="pane-splitter"
      role="separator"
      aria-label="Resize editor panes"
      tabindex="0"
      aria-orientation="vertical"
      aria-valuemin="25"
      aria-valuemax="75"
      :aria-valuenow="Math.round(splitRatio * 100)"
      @mousedown="emit('beginSplitResize', $event)"
      @keydown="emit('keyboardSplitResize', $event)"
      @dblclick="emit('resetLayout')"
    />
  </section>
</template>
