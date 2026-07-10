<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DocumentMapLine } from '../../domain/markdown/outline'

const props = defineProps<{
  lines: DocumentMapLine[]
  linePositions: Readonly<Record<number, number>>
  viewport: { top: number, height: number }
  width: number
}>()

const emit = defineEmits<{
  navigate: [ratio: number]
  resize: [width: number]
}>()

const mapDragActive = ref(false)
const mapResizeStart = ref<{ x: number, width: number } | null>(null)
const mapElement = ref<HTMLElement | null>(null)
const visibleHeight = ref(0)
const lineHeight = 5
let mapResizeObserver: ResizeObserver | null = null

const contentHeight = computed(() => Math.max(props.lines.length * lineHeight, 24))
const mapViewportHeight = computed(() => visibleHeight.value)
const viewportHeight = computed(() => Math.min(
  (props.viewport.height / 100) * contentHeight.value,
  mapViewportHeight.value || contentHeight.value,
))
const viewportContentTop = computed(() => (props.viewport.top / 100) * contentHeight.value)
const contentOffset = computed(() => {
  const maxOffset = Math.max(contentHeight.value - mapViewportHeight.value, 0)
  const scrollRange = 100 - props.viewport.height

  if (maxOffset === 0 || scrollRange <= 0) {
    return 0
  }

  return Math.min(Math.max(props.viewport.top / scrollRange, 0), 1) * maxOffset
})
const mapStyle = computed(() => ({
  '--document-map-content-height': `${contentHeight.value}px`,
}))
const contentStyle = computed(() => ({
  transform: `translateY(-${contentOffset.value}px)`,
}))
const viewportStyle = computed(() => ({
  top: `${8 + viewportContentTop.value - contentOffset.value}px`,
  height: `${viewportHeight.value}px`,
}))

function linePosition(line: DocumentMapLine) {
  return props.linePositions[line.index] ?? (line.index / Math.max(props.lines.length - 1, 1)) * 100
}

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
  const position = contentOffset.value + event.clientY - rect.top - 8
  emit('navigate', Math.min(Math.max(position / contentHeight.value, 0), 1))
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

onMounted(() => {
  if (!mapElement.value) {
    return
  }

  mapResizeObserver = new ResizeObserver(([entry]) => {
    visibleHeight.value = entry.contentRect.height
  })
  mapResizeObserver.observe(mapElement.value)
})

onBeforeUnmount(() => {
  stopResize()
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
})
</script>

<template>
  <aside
    ref="mapElement"
    class="document-map"
    aria-label="Document map"
    :style="mapStyle"
    @pointerdown="beginDrag"
    @pointermove="drag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
  >
    <span class="document-map-content" :style="contentStyle">
      <span
        v-for="line in lines"
        :key="line.index"
        class="document-map-line"
        :class="line.kind"
        :style="{
          '--map-line-width': `${line.width}%`,
          '--map-line-indent': `${line.indent}%`,
          '--map-line-top': `${linePosition(line)}%`,
        }"
      />
    </span>
    <span class="document-map-viewport" :style="viewportStyle" />
    <span class="document-map-resize-handle" role="separator" aria-label="Resize document map" @pointerdown.stop="beginResize" />
  </aside>
</template>
