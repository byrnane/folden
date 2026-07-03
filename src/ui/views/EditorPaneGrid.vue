<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import type { EditorAdapter, EditorPane, EditorPaneView } from '../../application/types/shell'
import SourceEditor from '../editors/SourceEditor.vue'
import VisualMarkdownEditor from '../editors/VisualMarkdownEditor.vue'
import {
  readDocumentDragPayload,
  type DocumentDragPayload,
} from '../documentDrag'
import { uiIconSizes } from '../uiConstants'

const tabPointerDragStartDistancePx = 5

const props = defineProps<{
  visiblePanes: EditorPaneView[]
  activePaneId: EditorPane['id']
  splitEnabled: boolean
  splitRatio: number
  sourceWordWrap: boolean
  workspaceRootPath: string | null
  closeDocument: (pane: EditorPane, documentId: string) => void | Promise<void>
  openDroppedPath: (path: string, paneId: EditorPane['id']) => void | Promise<void>
  setActiveDocument: (pane: EditorPane, documentId: string) => void | Promise<void>
  setPaneEditorAdapter: (paneId: EditorPane['id'], adapter: EditorAdapter | null) => void
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
  pointerId: number
  sourceElement: HTMLElement
  startX: number
  startY: number
  dragging: boolean
}

const tabPointerDrag = ref<TabPointerDrag | null>(null)
const suppressNextTabClick = ref(false)
let suppressNextTabClickTimeout = 0

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
  handleTabDrop(event, targetPaneId, pane?.tabs.length ?? 0)
}

function beginTabPointerDrag(event: PointerEvent, documentId: string, sourcePaneId: EditorPane['id']) {
  if (event.button !== 0) {
    return
  }

  const sourceElement = event.currentTarget as HTMLElement
  try {
    sourceElement.setPointerCapture(event.pointerId)
  } catch {
    return
  }

  tabPointerDrag.value = {
    documentId,
    sourcePaneId,
    pointerId: event.pointerId,
    sourceElement,
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
  const fallbackIndex = pane?.tabs.length ?? 0
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

function releaseTabPointerCapture(drag: TabPointerDrag) {
  if (drag.sourceElement.hasPointerCapture(drag.pointerId)) {
    drag.sourceElement.releasePointerCapture(drag.pointerId)
  }
}

function cancelTabPointerDrag() {
  const drag = tabPointerDrag.value
  tabPointerDrag.value = null

  if (drag) {
    releaseTabPointerCapture(drag)
  }
}

function finishTabPointerDrag(event: PointerEvent) {
  const drag = tabPointerDrag.value
  tabPointerDrag.value = null

  if (!drag?.dragging) {
    if (drag) {
      releaseTabPointerCapture(drag)
    }
    return
  }

  const target = getTabDropTarget(event)

  if (!target) {
    releaseTabPointerCapture(drag)
    return
  }

  releaseTabPointerCapture(drag)
  suppressNextTabClick.value = true
  window.clearTimeout(suppressNextTabClickTimeout)
  suppressNextTabClickTimeout = window.setTimeout(() => {
    suppressNextTabClick.value = false
    suppressNextTabClickTimeout = 0
  })
  moveDroppedDocument({
    kind: 'tab',
    documentId: drag.documentId,
    paneId: drag.sourcePaneId,
  }, target.paneId, target.targetIndex)
}

function handleTabClick(pane: EditorPane, documentId: string) {
  if (suppressNextTabClick.value) {
    window.clearTimeout(suppressNextTabClickTimeout)
    suppressNextTabClickTimeout = 0
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
            v-for="(tab, index) in pane.tabs"
            :key="tab.document.id"
            type="button"
            class="tab-button"
            :data-tab-drop-pane="pane.id"
            :data-tab-drop-index="index"
            :class="{ active: tab.isActive }"
            :title="tab.title"
            @pointerdown="beginTabPointerDrag($event, tab.document.id, pane.id)"
            @pointermove="handleTabPointerMove"
            @pointerup="finishTabPointerDrag"
            @pointercancel="cancelTabPointerDrag"
            @lostpointercapture="tabPointerDrag = null"
            @auxclick.stop="closeTabOnAuxClick($event, pane, tab.document.id)"
            @click.stop="handleTabClick(pane, tab.document.id)"
          >
            <span>{{ tab.document.name }}</span>
            <span v-if="tab.isDirty" class="tab-dot" />
            <X
              class="tab-close"
              :size="uiIconSizes.tabClose"
              @pointerdown.stop
              @click.stop="closeDocument(pane, tab.document.id)"
            />
          </button>
          <span
            class="tab-drop-tail"
            :data-tab-drop-pane="pane.id"
            :data-tab-drop-index="pane.tabs.length"
            @dragover.prevent.stop="handleDocumentDragOver"
            @drop.stop="handleTabDrop($event, pane.id, pane.tabs.length)"
          />
        </div>
      </header>

      <template v-if="pane.activeDocument">
        <VisualMarkdownEditor
          v-if="pane.activeDocument.mode === 'visual'"
          :key="`${pane.activeDocument.viewSessionId}:${pane.activeDocument.shouldLoadRemoteImages ? 'remote-on' : 'remote-off'}`"
          :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
          :document-id="pane.activeDocument.document.id"
          :view-id="pane.activeDocument.viewSessionId"
          :model-value="pane.activeDocument.document.content"
          :revision="pane.activeDocument.document.revision"
          :document-path="pane.activeDocument.document.path"
          :workspace-root-path="workspaceRootPath"
          :allow-remote-images="pane.activeDocument.shouldLoadRemoteImages"
          @document-update="emit('documentUpdate', $event)"
        />
        <section v-else class="source-editor-frame">
          <SourceEditor
            :key="`${pane.activeDocument.viewSessionId}:${sourceWordWrap ? 'wrap' : 'nowrap'}`"
            :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
            :document-id="pane.activeDocument.document.id"
            :view-id="pane.activeDocument.viewSessionId"
            :model-value="pane.activeDocument.document.content"
            :revision="pane.activeDocument.document.revision"
            :word-wrap="sourceWordWrap"
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
