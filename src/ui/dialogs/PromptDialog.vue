<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppDialog from './AppDialog.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    initialValue?: string
    placeholder?: string
    confirmLabel?: string
    cancelLabel?: string
    error?: string | null
    inputLabel?: string
  }>(),
  {
    initialValue: '',
    placeholder: '',
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    error: null,
    inputLabel: 'Value',
  },
)

const emit = defineEmits<{
  submit: [value: string]
  cancel: []
}>()

const localValue = ref(props.initialValue)
const inputElement = ref<HTMLInputElement | null>(null)

function handleSubmit() {
  emit('submit', localValue.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      localValue.value = props.initialValue
      window.addEventListener('keydown', handleKeydown)
      await nextTick()
      inputElement.value?.focus()
      inputElement.value?.select()
      return
    }

    window.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)

watch(
  () => props.initialValue,
  (value) => {
    if (props.open) {
      localValue.value = value
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <AppDialog v-if="open" :title="title">
    <form class="dialog-form" @submit.prevent="handleSubmit">
      <p class="app-dialog-message">{{ message }}</p>
      <label class="dialog-field">
        <span class="dialog-field-label">{{ inputLabel }}</span>
        <input
          ref="inputElement"
          v-model="localValue"
          class="dialog-input"
          :placeholder="placeholder"
        />
      </label>
      <p v-if="error" class="dialog-error">{{ error }}</p>

      <div class="dialog-inline-actions">
        <button type="button" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button type="submit">
          {{ confirmLabel }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>
