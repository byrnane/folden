<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { DocumentMapLine } from '../../domain/markdown/outline'

const props = defineProps<{
  lines: DocumentMapLine[]
  viewport: { top: number, height: number }
  width: number
}>()

const emit = defineEmits<{
  navigate: [ratio: number]
  resize: [width: number]
}>()

const mapDragActive = ref(false)
const mapResizeStart = ref<{ x: number, width: number } | null>(null)
const viewportStyle = computed(() => ({
  top: `${props.viewport.top}%`,
  height: `${props.viewport.height}%`,
}))

function beginDrag(event: PointerEvent) {
  mapDragActive.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  navigate(event)
}

function drag(event: PointerEvent) {
  if (mapDragActive.value) {
    navigate(event)
  }
}

function navigate(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('navigate', Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1))
}

function endDrag() {
  mapDragActive.value = false
}

function beginResize(event: PointerEvent) {
  mapResizeStart.value = { x: event.clientX, width: props.width }
  window.addEventListener('pointermove', resize)
  window.addEventListener('pointerup', stopResize)
}

function resize(event: PointerEvent) {
  if (mapResizeStart.value) {
    emit('resize', mapResizeStart.value.width - event.clientX + mapResizeStart.value.x)
  }
}

function stopResize() {
  mapResizeStart.value = null
  window.removeEventListener('pointermove', resize)
  window.removeEventListener('pointerup', stopResize)
}

onBeforeUnmount(stopResize)
</script>

<template>
  <aside
    class="document-map"
    aria-label="Document map"
    @pointerdown="beginDrag"
    @pointermove="drag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
  >
    <span
      v-for="line in lines"
      :key="line.index"
      class="document-map-line"
      :class="line.kind"
      :style="{ '--map-line-width': `${line.width}%`, '--map-line-indent': `${line.indent}%` }"
    />
    <span class="document-map-viewport" :style="viewportStyle" />
    <span class="document-map-resize-handle" role="separator" aria-label="Resize document map" @pointerdown.stop="beginResize" />
  </aside>
</template>
