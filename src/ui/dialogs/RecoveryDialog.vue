<script setup lang="ts">
import { t } from '../../application/i18n'
import { onBeforeUnmount, watch } from 'vue'
import AppDialog from './AppDialog.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    details?: string | null
  }>(),
  {
    details: null,
  },
)

const emit = defineEmits<{
  restore: []
  openCopy: []
  discard: []
  later: []
}>()

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
  <AppDialog v-if="open" :title="title">
    <p class="app-dialog-message">{{ message }}</p>
    <p v-if="details" class="dialog-details">{{ details }}</p>

    <template #actions>
      <button type="button" @click="emit('later')">{{ t('Later') }}</button>
      <button type="button" class="danger" @click="emit('discard')">{{ t('Discard') }}</button>
      <button type="button" @click="emit('openCopy')">{{ t('Open as copy') }}</button>
      <button type="button" @click="emit('restore')">{{ t('Restore') }}</button>
    </template>
  </AppDialog>
</template>
