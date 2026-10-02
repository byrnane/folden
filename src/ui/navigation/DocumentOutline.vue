<script setup lang="ts">
import { t } from '../../application/i18n'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { MarkdownHeading } from '../../domain/markdown/outline'

const props = defineProps<{
  headings: MarkdownHeading[]
  activeHeadingId: string | null
  width: number
}>()

const emit = defineEmits<{
  select: [heading: MarkdownHeading]
  resize: [width: number]
}>()

const buttons = ref<HTMLButtonElement[]>([])
const resizeStart = ref<{ x: number; width: number } | null>(null)
const activeIndex = computed(() =>
  Math.max(
    0,
    props.headings.findIndex((heading) => heading.id === props.activeHeadingId),
  ),
)

function selectHeading(heading: MarkdownHeading) {
  emit('select', heading)
}

function moveFocus(currentIndex: number, direction: -1 | 1) {
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), props.headings.length - 1)
  void nextTick(() => buttons.value[nextIndex]?.focus())
}

function handleKeydown(event: KeyboardEvent, index: number, heading: MarkdownHeading) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(index, event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    void nextTick(() =>
      buttons.value[event.key === 'Home' ? 0 : props.headings.length - 1]?.focus(),
    )
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectHeading(heading)
  }
}

function beginResize(event: PointerEvent) {
  resizeStart.value = { x: event.clientX, width: props.width }
  window.addEventListener('pointermove', resize)
  window.addEventListener('pointerup', stopResize)
}

function resize(event: PointerEvent) {
  if (resizeStart.value) {
    emit('resize', resizeStart.value.width + event.clientX - resizeStart.value.x)
  }
}

function stopResize() {
  resizeStart.value = null
  window.removeEventListener('pointermove', resize)
  window.removeEventListener('pointerup', stopResize)
}

onBeforeUnmount(stopResize)
</script>

<template>
  <aside class="document-outline" :aria-label="t('Document outline')">
    <button
      v-for="(heading, index) in headings"
      :key="`${heading.line}:${heading.id}`"
      ref="buttons"
      type="button"
      class="document-outline-item"
      :class="{ active: heading.id === activeHeadingId }"
      :tabindex="index === activeIndex ? 0 : -1"
      :style="{ '--heading-level': heading.level }"
      @click="selectHeading(heading)"
      @keydown="handleKeydown($event, index, heading)"
    >
      {{ heading.text }}
    </button>
    <span
      class="outline-resize-handle"
      role="separator"
      :aria-label="t('Resize outline')"
      @pointerdown="beginResize"
    />
  </aside>
</template>
