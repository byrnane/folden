<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DocumentMapSegment } from '../../domain/markdown/outline'

const props = defineProps<{
  segments: DocumentMapSegment[]
  linePositions: Readonly<Record<number, number>>
  viewport: { top: number; height: number }
  width: number
}>()

const emit = defineEmits<{
  navigate: [ratio: number]
  resize: [width: number]
}>()

const mapDragActive = ref(false)
const mapResizeStart = ref<{ x: number; width: number } | null>(null)
const mapElement = ref<HTMLElement | null>(null)
const canvasElement = ref<HTMLCanvasElement | null>(null)
const visibleHeight = ref(0)
const lineHeight = 5
let mapResizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let dprMediaQuery: MediaQueryList | null = null
let drawFrame = 0

const naturalContentHeight = computed(() => Math.max(props.segments.length * lineHeight, 24))
const contentHeight = computed(() => naturalContentHeight.value)
const mapViewportHeight = computed(() => visibleHeight.value)
const viewportHeight = computed(() =>
  Math.min(
    (props.viewport.height / 100) * contentHeight.value,
    mapViewportHeight.value || contentHeight.value,
  ),
)
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

function segmentPosition(segment: DocumentMapSegment) {
  return props.linePositions[segment.index] ?? segment.position * 100
}

function drawMap() {
  window.cancelAnimationFrame(drawFrame)
  drawFrame = window.requestAnimationFrame(() => {
    const canvas = canvasElement.value
    if (!canvas) return
    const width = Math.max(canvas.clientWidth, 1)
    const height = contentHeight.value
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = Math.ceil(width * ratio)
    canvas.height = Math.ceil(height * ratio)
    const context = canvas.getContext('2d')
    if (!context) return
    const styles = getComputedStyle(mapElement.value ?? canvas)
    const mapColors = {
      heading: styles.getPropertyValue('--map-heading').trim(),
      list: styles.getPropertyValue('--map-list').trim(),
      text: styles.getPropertyValue('--map-text').trim(),
    }
    context.scale(ratio, ratio)
    context.clearRect(0, 0, width, height)

    for (const segment of props.segments) {
      if (segment.kind === 'empty') continue
      const indent = (segment.indent / 100) * width
      const segmentWidth = Math.max(((segment.width - segment.indent) / 100) * width, 5)
      const y = (segmentPosition(segment) / 100) * Math.max(height - 3, 0)
      context.fillStyle =
        segment.kind === 'heading'
          ? mapColors.heading
          : segment.kind === 'list'
            ? mapColors.list
            : mapColors.text
      context.fillRect(indent, y, segmentWidth, segment.kind === 'heading' ? 3 : 2)
    }
  })
}

function watchDevicePixelRatio() {
  dprMediaQuery?.removeEventListener('change', handleDevicePixelRatioChange)
  dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  dprMediaQuery.addEventListener('change', handleDevicePixelRatioChange)
}

function handleDevicePixelRatioChange() {
  watchDevicePixelRatio()
  drawMap()
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
    drawMap()
  })
  mapResizeObserver.observe(mapElement.value)
  const themeHost = mapElement.value.closest('[data-theme]')
  if (themeHost) {
    themeObserver = new MutationObserver(drawMap)
    themeObserver.observe(themeHost, { attributes: true, attributeFilter: ['data-theme'] })
  }
  window.addEventListener('resize', drawMap)
  watchDevicePixelRatio()
})

watch(() => [props.segments, props.linePositions] as const, drawMap, { deep: true })

onBeforeUnmount(() => {
  stopResize()
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  window.removeEventListener('resize', drawMap)
  dprMediaQuery?.removeEventListener('change', handleDevicePixelRatioChange)
  dprMediaQuery = null
  window.cancelAnimationFrame(drawFrame)
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
    <canvas ref="canvasElement" class="document-map-content" :style="contentStyle" />
    <span class="document-map-viewport" :style="viewportStyle" />
    <span
      class="document-map-resize-handle"
      role="separator"
      aria-label="Resize document map"
      @pointerdown.stop="beginResize"
    />
  </aside>
</template>
