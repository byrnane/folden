<script setup lang="ts">
import type { OpenDocument } from '../../domain/documents/documentState'
import type { EditorPane } from '../../application/types/shell'
import { startDocumentDrag } from '../documentDrag'

const props = defineProps<{
  documents: OpenDocument[]
  visiblePanes: EditorPane[]
  activePane: EditorPane | undefined
  activePaneId: EditorPane['id']
  collapsed: boolean
  cleanDisplayPath: (path: string) => string
  isDirty: (document: OpenDocument) => boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [collapsed: boolean]
  selectDocument: [pane: EditorPane, documentId: string]
}>()

function getDocumentPaneIds(documentId: string) {
  return props.visiblePanes
    .filter((pane) => pane.documentIds.includes(documentId))
    .map((pane) => pane.id)
}

function getDocumentPaneLabel(documentId: string) {
  const paneIds = getDocumentPaneIds(documentId)
  const hasLeft = paneIds.includes('left')
  const hasRight = paneIds.includes('right')

  if (hasLeft && hasRight) {
    return 'L/R'
  }

  if (hasRight) {
    return 'R'
  }

  if (hasLeft) {
    return 'L'
  }

  return '-'
}

function getPrimaryDocumentPane(documentId: string) {
  if (props.activePane?.documentIds.includes(documentId)) {
    return props.activePane
  }

  return props.visiblePanes.find((pane) => pane.documentIds.includes(documentId)) ?? props.activePane
}

function isVisiblePaneDocument(documentId: string) {
  return props.visiblePanes.some((pane) => pane.activeDocumentId === documentId)
}

function isActivePaneDocument(documentId: string) {
  return props.activePane?.activeDocumentId === documentId
}

function selectDocument(documentId: string) {
  const pane = getPrimaryDocumentPane(documentId)

  if (pane) {
    emit('selectDocument', pane, documentId)
  }
}
</script>

<template>
  <section v-if="documents.length && !collapsed" class="open-editors" aria-label="Open editors">
    <button type="button" class="section-header" @click="emit('update:collapsed', true)">
      Open Editors
    </button>
    <button
      v-for="document in documents"
      :key="document.id"
      type="button"
      class="open-editor-row"
      :class="{
        active: isVisiblePaneDocument(document.id),
        'active-pane-document': isActivePaneDocument(document.id),
      }"
      :title="document.path ? cleanDisplayPath(document.path) : 'Scratch document'"
      draggable="true"
      @dragstart="startDocumentDrag($event, {
        kind: 'open-editor',
        documentId: document.id,
        paneId: getPrimaryDocumentPane(document.id)?.id ?? activePaneId,
      })"
      @click="selectDocument(document.id)"
    >
      <span class="open-editor-dirty-slot" aria-hidden="true">
        <span v-if="isDirty(document)" class="open-editor-dirty-dot" />
      </span>
      <span class="open-editor-name">{{ document.name }}</span>
      <span class="open-editor-pane">
        {{ getDocumentPaneLabel(document.id) }}
      </span>
    </button>
  </section>
  <button v-else-if="documents.length" type="button" class="section-header" @click="emit('update:collapsed', false)">
    Open Editors
  </button>
</template>
