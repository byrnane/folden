<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue'
import type { WorkspaceEntry } from '../../domain/native'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import type {
  EditorAdapter,
  EditorCommand,
  EditorPane,
  EditorPaneView,
} from '../../application/types/shell'
import { readDocumentDragPayload, type DocumentDragPayload } from '../documentDrag'
import {
  cleanupEditorPaneGridInteractionState,
  clearPendingTabClickSuppression,
  releaseTabPointerCapture,
  type EditorPaneGridInteractionState,
  type TabPointerDrag,
} from './editorPaneGridLifecycle'
import { uiIconSizes } from '../uiConstants'

const tabPointerDragStartDistancePx = 5
const SourceEditor = defineAsyncComponent(() => import('../editors/SourceEditor.vue'))
const VisualMarkdownEditor = defineAsyncComponent(
  () => import('../editors/VisualMarkdownEditor.vue'),
)

const props = defineProps<{
  visiblePanes: EditorPaneView[]
  activePaneId: EditorPane['id']
  splitEnabled: boolean
  splitRatio: number
  sourceWordWrap: boolean
  outlineWidth: number
  documentMapWidth: number
  showDocumentOutline: boolean
  showDocumentMap: boolean
  workspaceRootPath: string | null
  closeDocument: (pane: EditorPane, documentId: string) => void | Promise<void>
  openDroppedPath: (path: string, paneId: EditorPane['id']) => void | Promise<void>
  openWorkspaceFile: (
    entry: Pick<WorkspaceEntry, 'path' | 'kind'>,
    paneId: EditorPane['id'],
  ) => void | Promise<void>
  setActiveDocument: (pane: EditorPane, documentId: string) => void | Promise<void>
  setPaneEditorAdapter: (paneId: EditorPane['id'], adapter: EditorAdapter | null) => void
}>()

const emit = defineEmits<{
  beginSplitResize: [event: MouseEvent]
  documentUpdate: [update: DocumentUpdate]
  toolbarState: [paneId: EditorPane['id'], state: { disabledCommands: EditorCommand[] }]
  moveDocumentBetweenPanes: [
    documentId: string,
    sourcePaneId: EditorPane['id'],
    targetPaneId: EditorPane['id'],
    targetIndex?: number,
  ]
  keyboardSplitResize: [event: KeyboardEvent]
  setOutlineWidth: [width: number]
  setDocumentMapWidth: [width: number]
  reorderDocumentInPane: [paneId: EditorPane['id'], documentId: string, targetIndex: number]
  resetLayout: []
  setActivePane: [paneId: EditorPane['id']]
}>()

const tabPointerDrag = ref<TabPointerDrag | null>(null)
const suppressNextTabClick = ref(false)
const activeDropTarget = ref<string | null>(null)
const nativeDragActive = ref(false)
let editorPaneGridUnmounted = false
const interactionState: EditorPaneGridInteractionState = {
  tabPointerDrag,
  suppressNextTabClick,
  suppressNextTabClickTimeout: 0,
}

function handleDocumentDragOver(event: DragEvent) {
  nativeDragActive.value = true
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function setDropTarget(kind: string, paneId: EditorPane['id']) {
  nativeDragActive.value = true
  activeDropTarget.value = `${kind}:${paneId}`
}

function clearDropTarget() {
  activeDropTarget.value = null
  nativeDragActive.value = false
}

function isDropTarget(kind: string, paneId: EditorPane['id']) {
  return activeDropTarget.value === `${kind}:${paneId}`
}

function dragActive() {
  return nativeDragActive.value || tabPointerDrag.value?.dragging === true
}

function getDroppedPath(event: DragEvent) {
  const file = event.dataTransfer?.files.item(0) as
    | (File & {
        path?: string
      })
    | null

  return file?.path ?? file?.webkitRelativePath ?? null
}

function moveDroppedDocument(
  payload: DocumentDragPayload,
  targetPaneId: EditorPane['id'],
  targetIndex?: number,
) {
  if (payload.kind === 'workspace-file') {
    void props.openWorkspaceFile({ kind: 'file', path: payload.path }, targetPaneId)
    return
  }

  if (payload.kind === 'external-path') {
    void props.openDroppedPath(payload.path, targetPaneId)
    return
  }

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
  clearDropTarget()
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
  clearDropTarget()
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
  clearDropTarget()
  moveDroppedDocument(payload, targetPaneId, targetIndex)
}

function handleTabListDrop(event: DragEvent, targetPaneId: EditorPane['id']) {
  const pane = props.visiblePanes.find((candidate) => candidate.id === targetPaneId)
  handleTabDrop(event, targetPaneId, pane?.tabs.length ?? 0)
}

function beginTabPointerDrag(
  event: PointerEvent,
  documentId: string,
  label: string,
  sourcePaneId: EditorPane['id'],
) {
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
    label,
    sourcePaneId,
    pointerId: event.pointerId,
    sourceElement,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    dragging: false,
  }
}

function getTabDropTarget(event: PointerEvent) {
  const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
  const rightSplitTarget = target?.closest<HTMLElement>('[data-right-split-drop-zone]')

  if (rightSplitTarget) {
    const rightPane = props.visiblePanes.find((candidate) => candidate.id === 'right')
    return {
      paneId: 'right' as const,
      targetIndex: rightPane?.tabs.length ?? 0,
      dropKind: 'right-split',
    }
  }

  const tabTarget = target?.closest<HTMLElement>('[data-tab-drop-pane]')
  const paneTarget = target?.closest<HTMLElement>('[data-pane-id]')
  const paneId = (tabTarget?.dataset.tabDropPane ?? paneTarget?.dataset.paneId) as
    EditorPane['id'] | undefined

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
    dropKind: undefined,
  }
}

function handleTabPointerMove(event: PointerEvent) {
  const drag = tabPointerDrag.value

  if (!drag) {
    return
  }

  if (
    !drag.dragging &&
    Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <
      tabPointerDragStartDistancePx
  ) {
    return
  }

  drag.dragging = true
  drag.currentX = event.clientX
  drag.currentY = event.clientY
  const target = getTabDropTarget(event)
  if (target) {
    const pane = props.visiblePanes.find((candidate) => candidate.id === target.paneId)
    const kind =
      target.dropKind ??
      (target.targetIndex >= (pane?.tabs.length ?? 0) ? 'tab-tail' : `tab-${target.targetIndex}`)
    activeDropTarget.value = `${kind}:${target.paneId}`
  } else {
    activeDropTarget.value = null
  }
  event.preventDefault()
}

function cancelTabPointerDrag() {
  const drag = tabPointerDrag.value
  tabPointerDrag.value = null
  activeDropTarget.value = null

  if (drag) {
    releaseTabPointerCapture(drag)
  }
}

function finishTabPointerDrag(event: PointerEvent) {
  const drag = tabPointerDrag.value
  tabPointerDrag.value = null
  activeDropTarget.value = null

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
  window.clearTimeout(interactionState.suppressNextTabClickTimeout)
  interactionState.suppressNextTabClickTimeout = window.setTimeout(() => {
    if (editorPaneGridUnmounted) {
      return
    }

    suppressNextTabClick.value = false
    interactionState.suppressNextTabClickTimeout = 0
  })
  moveDroppedDocument(
    {
      kind: 'tab',
      documentId: drag.documentId,
      paneId: drag.sourcePaneId,
    },
    target.paneId,
    target.targetIndex,
  )
}

function openRightSplitDrop(event: DragEvent) {
  const payload = readDocumentDragPayload(event)
  event.preventDefault()
  event.stopPropagation()
  clearDropTarget()

  if (payload) {
    moveDroppedDocument(payload, 'right')
    return
  }

  openDroppedFile(event, 'right')
}

function handleTabClick(pane: EditorPane, documentId: string) {
  if (suppressNextTabClick.value) {
    clearPendingTabClickSuppression(interactionState)
    return
  }

  void props.setActiveDocument(pane, documentId)
}

function closeTabOnAuxClick(event: MouseEvent, pane: EditorPane, documentId: string) {
  if (event.button === 1) {
    void props.closeDocument(pane, documentId)
  }
}

onBeforeUnmount(() => {
  editorPaneGridUnmounted = true
  cleanupEditorPaneGridInteractionState(interactionState)
})
</script>

<template>
  <section
    class="pane-grid"
    :class="{ split: splitEnabled, 'drag-active': dragActive() }"
    @dragenter="nativeDragActive = true"
    @dragend="clearDropTarget"
    @dragleave.self="clearDropTarget"
  >
    <section
      v-for="pane in visiblePanes"
      :key="pane.id"
      class="editor-pane"
      :data-pane-id="pane.id"
      :class="{
        active: activePaneId === pane.id,
        'drop-target-active': isDropTarget('pane', pane.id),
      }"
      @click="emit('setActivePane', pane.id)"
      @dragenter="setDropTarget('pane', pane.id)"
      @dragover.prevent="handleDocumentDragOver"
      @dragleave.self="clearDropTarget"
      @drop="handlePaneDrop($event, pane.id)"
    >
      <header class="pane-header">
        <div
          class="pane-tabs"
          :class="{ 'drop-target-active': isDropTarget('tabs', pane.id) }"
          @dragenter.stop="setDropTarget('tabs', pane.id)"
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
            :class="{
              active: tab.isActive,
              'tab-drop-active': isDropTarget(`tab-${index}`, pane.id),
            }"
            :title="tab.title"
            @dragenter.stop="setDropTarget(`tab-${index}`, pane.id)"
            @pointerdown="beginTabPointerDrag($event, tab.document.id, tab.label, pane.id)"
            @pointermove="handleTabPointerMove"
            @pointerup="finishTabPointerDrag"
            @pointercancel="cancelTabPointerDrag"
            @lostpointercapture="tabPointerDrag = null"
            @auxclick.stop="closeTabOnAuxClick($event, pane, tab.document.id)"
            @click.stop="handleTabClick(pane, tab.document.id)"
          >
            <span>{{ tab.label }}</span>
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
            :class="{ 'tab-drop-active': isDropTarget('tab-tail', pane.id) }"
            :data-tab-drop-pane="pane.id"
            :data-tab-drop-index="pane.tabs.length"
            @dragenter.stop="setDropTarget('tab-tail', pane.id)"
            @dragover.prevent.stop="handleDocumentDragOver"
            @drop.stop="handleTabDrop($event, pane.id, pane.tabs.length)"
          />
        </div>
      </header>

      <template v-if="pane.activeDocument">
        <Suspense v-if="pane.activeDocument.mode === 'visual'">
          <VisualMarkdownEditor
            :key="`${pane.activeDocument.viewSessionId}:${pane.activeDocument.shouldLoadRemoteImages ? 'remote-on' : 'remote-off'}`"
            :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
            :document-id="pane.activeDocument.document.id"
            :view-id="pane.activeDocument.viewSessionId"
            :model-value="pane.activeDocument.document.content"
            :revision="pane.activeDocument.document.revision"
            :document-path="pane.activeDocument.document.path"
            :workspace-root-path="workspaceRootPath"
            :outline-width="outlineWidth"
            :document-map-width="documentMapWidth"
            :show-document-outline="showDocumentOutline"
            :show-document-map="showDocumentMap"
            :allow-remote-images="pane.activeDocument.shouldLoadRemoteImages"
            :view-state="pane.activeDocument.viewSession"
            @document-update="emit('documentUpdate', $event)"
            @toolbar-state="emit('toolbarState', pane.id, $event)"
            @set-outline-width="emit('setOutlineWidth', $event)"
            @set-document-map-width="emit('setDocumentMapWidth', $event)"
          />
          <template #fallback>
            <div class="editor-loading" role="status">Loading Visual editor…</div>
          </template>
        </Suspense>
        <section v-else class="source-editor-frame">
          <Suspense>
            <SourceEditor
              :key="`${pane.activeDocument.viewSessionId}:${sourceWordWrap ? 'wrap' : 'nowrap'}`"
              :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
              :document-id="pane.activeDocument.document.id"
              :view-id="pane.activeDocument.viewSessionId"
              :model-value="pane.activeDocument.document.content"
              :revision="pane.activeDocument.document.revision"
              :word-wrap="sourceWordWrap"
              :is-markdown="pane.activeDocument.isMarkdown"
              :outline-width="outlineWidth"
              :document-map-width="documentMapWidth"
              :show-document-outline="showDocumentOutline"
              :show-document-map="showDocumentMap"
              :view-state="pane.activeDocument.viewSession"
              @document-update="emit('documentUpdate', $event)"
              @set-outline-width="emit('setOutlineWidth', $event)"
              @set-document-map-width="emit('setDocumentMapWidth', $event)"
            />
            <template #fallback>
              <div class="editor-loading" role="status">Loading Source editor…</div>
            </template>
          </Suspense>
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
    <aside
      v-else
      class="right-split-drop-zone"
      data-right-split-drop-zone="true"
      :class="{ 'drop-target-active': isDropTarget('right-split', 'right') }"
      @dragenter="setDropTarget('right-split', 'right')"
      @dragover.prevent="handleDocumentDragOver"
      @dragleave.self="clearDropTarget"
      @drop="openRightSplitDrop"
    >
      Drop to split right
    </aside>
    <div
      v-if="tabPointerDrag?.dragging"
      class="drag-preview tab-pointer-preview"
      :style="{
        transform: `translate3d(${tabPointerDrag.currentX + 12}px, ${tabPointerDrag.currentY + 12}px, 0)`,
      }"
    >
      {{ tabPointerDrag.label }}
    </div>
  </section>
</template>
