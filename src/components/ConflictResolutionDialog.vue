<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { buildConflictDiffRows } from '../conflictDiff'
import AppDialog from './AppDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  path?: string | null
  foldenContent: string
  diskContent: string
}>(), {
  path: null,
})

const emit = defineEmits<{
  keepFolden: []
  reloadDisk: []
  saveAs: []
  applyMerged: [value: string]
  later: []
}>()

const mergedContent = ref(props.foldenContent)

const diffRows = computed(() => buildConflictDiffRows(props.foldenContent, props.diskContent))

watch(
  () => [props.open, props.foldenContent, props.diskContent] as const,
  ([isOpen, foldenContent]) => {
    if (isOpen) {
      mergedContent.value = foldenContent
    }
  },
  { immediate: true },
)

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('later')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown)
      return
    }

    window.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <AppDialog v-if="open" :title="title" width="wide">
    <p class="app-dialog-message">
      Folden kept your unsaved version and loaded the latest disk version for comparison.
    </p>
    <p v-if="path" class="dialog-details">
      {{ path }}
    </p>

    <section class="conflict-legend" aria-label="Conflict legend">
      <span class="conflict-pill changed">Changed</span>
      <span class="conflict-pill added">Disk only</span>
      <span class="conflict-pill removed">Folden only</span>
    </section>

    <section class="conflict-diff" data-testid="conflict-diff">
      <div class="conflict-panel">
        <header class="conflict-panel-header">
          <strong>Folden version</strong>
          <span>Unsaved edits in memory</span>
        </header>
        <div class="conflict-lines">
          <div
            v-for="row in diffRows"
            :key="`left-${row.leftLineNumber}-${row.rightLineNumber}-${row.leftText}-${row.rightText}`"
            class="conflict-line"
            :class="row.kind"
          >
            <span class="conflict-line-number">{{ row.leftLineNumber ?? '' }}</span>
            <pre>{{ row.leftText || ' ' }}</pre>
          </div>
        </div>
      </div>

      <div class="conflict-panel">
        <header class="conflict-panel-header">
          <strong>Disk version</strong>
          <span>Latest file content on disk</span>
        </header>
        <div class="conflict-lines">
          <div
            v-for="row in diffRows"
            :key="`right-${row.leftLineNumber}-${row.rightLineNumber}-${row.leftText}-${row.rightText}`"
            class="conflict-line"
            :class="row.kind"
          >
            <span class="conflict-line-number">{{ row.rightLineNumber ?? '' }}</span>
            <pre>{{ row.rightText || ' ' }}</pre>
          </div>
        </div>
      </div>
    </section>

    <section class="conflict-merge">
      <label class="dialog-field-label" for="conflict-merge-textarea">Manual merge result</label>
      <textarea
        id="conflict-merge-textarea"
        v-model="mergedContent"
        class="conflict-merge-input"
        spellcheck="false"
        data-testid="conflict-merge-input"
      />
    </section>

    <template #actions>
      <button type="button" @click="emit('later')">
        Later
      </button>
      <button type="button" @click="emit('saveAs')">
        Save As
      </button>
      <button type="button" @click="emit('reloadDisk')">
        Reload disk version
      </button>
      <button type="button" @click="emit('keepFolden')">
        Keep Folden version
      </button>
      <button type="button" @click="emit('applyMerged', mergedContent)">
        Apply merged result
      </button>
    </template>
  </AppDialog>
</template>
