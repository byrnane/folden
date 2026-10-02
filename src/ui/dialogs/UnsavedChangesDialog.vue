<script setup lang="ts">
import { t } from '../../application/i18n'
import { onBeforeUnmount, watch } from 'vue'
import AppDialog from './AppDialog.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    saveLabel?: string
    discardLabel?: string
    cancelLabel?: string
    showSave?: boolean
  }>(),
  {
    saveLabel: 'Save',
    discardLabel: 'Discard',
    cancelLabel: 'Cancel',
    showSave: true,
  },
)

const emit = defineEmits<{
  save: []
  discard: []
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
        {{ t(cancelLabel) }}
      </button>
      <button type="button" class="danger" @click="emit('discard')">
        {{ t(discardLabel) }}
      </button>
      <button v-if="showSave" type="button" @click="emit('save')">
        {{ t(saveLabel) }}
      </button>
    </template>
  </AppDialog>
</template>
