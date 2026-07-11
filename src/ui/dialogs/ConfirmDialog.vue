<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import AppDialog from './AppDialog.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    confirmTone?: 'default' | 'danger'
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmTone: 'default',
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    emit('confirm')
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
  <AppDialog v-if="open" :title="title">
    <p class="app-dialog-message">{{ message }}</p>

    <template #actions>
      <button type="button" @click="emit('cancel')">
        {{ cancelLabel }}
      </button>
      <button type="button" :class="{ danger: confirmTone === 'danger' }" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
    </template>
  </AppDialog>
</template>
