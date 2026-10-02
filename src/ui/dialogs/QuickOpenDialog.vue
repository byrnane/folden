<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import AppDialog from './AppDialog.vue'
import { t } from '../../application/i18n'
const props = defineProps<{
  query: string
  files: string[]
  busy: boolean
  error: string
  partial: boolean
}>()
const emit = defineEmits<{ query: [value: string]; open: [path: string]; close: [] }>()
const selected = ref(0)
const input = ref<HTMLInputElement | null>(null)
const results = ref<HTMLDivElement | null>(null)
onMounted(() => input.value?.focus())
watch(
  () => props.query,
  () => (selected.value = 0),
)
watch(
  () => props.files,
  () => (selected.value = Math.min(selected.value, Math.max(props.files.length - 1, 0))),
)
watch(selected, () =>
  nextTick(() => results.value?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })),
)
function next(direction: number) {
  selected.value = Math.max(0, Math.min(props.files.length - 1, selected.value + direction))
}
</script>
<template>
  <AppDialog :title="t('Quick open')" @keydown.esc="emit('close')">
    <input
      ref="input"
      :value="query"
      :aria-label="t('File name or path')"
      :placeholder="t('File name or path')"
      @input="emit('query', ($event.target as HTMLInputElement).value)"
      @keydown.down.prevent="next(1)"
      @keydown.up.prevent="next(-1)"
      @keydown.enter.prevent="files[selected] && emit('open', files[selected])"
    />
    <p v-if="busy">{{ t('Searching…') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="partial">{{ t('Partial results') }}</p>
    <p v-if="!busy && !error && !files.length">{{ t('No matches') }}</p>
    <div ref="results" class="quick-open-results">
      <button
        v-for="(path, index) in files"
        :key="path"
        :class="{ active: index === selected }"
        @click="emit('open', path)"
      >
        {{ path }}
      </button>
    </div>
    <template #actions
      ><button @click="emit('close')">{{ t('Cancel') }}</button></template
    >
  </AppDialog>
</template>
