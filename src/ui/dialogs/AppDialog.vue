<script setup lang="ts">
import { t } from '../../application/i18n'
import { onMounted, onUnmounted, ref, useSlots } from 'vue'

defineProps<{
  title: string
  width?: 'default' | 'wide'
}>()

const slots = useSlots()
const dialogElement = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null

function focusableElements() {
  return Array.from(
    dialogElement.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((element) => element.getClientRects().length > 0)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return

  event.preventDefault()
  const elements = focusableElements()
  const index = elements.indexOf(document.activeElement as HTMLElement)
  const nextIndex = event.shiftKey
    ? index <= 0
      ? elements.length - 1
      : index - 1
    : index === elements.length - 1
      ? 0
      : index + 1
  ;(elements[nextIndex] ?? dialogElement.value)?.focus()
}

function handleBackgroundBeforeInput(event: Event) {
  // Native Undo can target the editor even when a dialog control has focus.
  if (event.target instanceof Node && !dialogElement.value?.contains(event.target)) {
    event.preventDefault()
    event.stopPropagation()
  }
}

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  ;(focusableElements()[0] ?? dialogElement.value)?.focus()
  window.addEventListener('beforeinput', handleBackgroundBeforeInput, true)
})

onUnmounted(() => {
  window.removeEventListener('beforeinput', handleBackgroundBeforeInput, true)
  if (previousFocus?.isConnected) previousFocus.focus()
})
</script>

<template>
  <div class="app-dialog-backdrop">
    <section
      ref="dialogElement"
      class="app-dialog"
      :class="{ wide: width === 'wide' }"
      role="dialog"
      aria-modal="true"
      :aria-label="t(title)"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <header class="app-dialog-header">
        <h2>{{ t(title) }}</h2>
      </header>

      <div class="app-dialog-body">
        <slot />
      </div>

      <footer v-if="slots.actions" class="app-dialog-actions">
        <slot name="actions" />
      </footer>
    </section>
  </div>
</template>
