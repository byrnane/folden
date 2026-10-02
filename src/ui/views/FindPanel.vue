<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '../../application/i18n'
defineProps<{
  query: string
  replacement: string
  matchCase: boolean
  count: number
  index: number
  mode: string
  replace: boolean
}>()
const emit = defineEmits<{
  query: [value: string]
  replacement: [value: string]
  matchCase: [value: boolean]
  next: [direction: number]
  replaceOne: []
  replaceAll: []
  close: []
}>()
const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())
</script>
<template>
  <section class="find-panel" :aria-label="t('Find')" @keydown.esc="emit('close')">
    <span>{{ t(mode === 'visual' ? 'In text' : 'In Markdown') }}</span>
    <input
      ref="input"
      :value="query"
      :aria-label="t('Find')"
      :placeholder="t('Find')"
      @input="emit('query', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="emit('next', $event.shiftKey ? -1 : 1)"
    />
    <label
      ><input
        type="checkbox"
        :aria-label="t('Match case')"
        :checked="matchCase"
        @change="emit('matchCase', ($event.target as HTMLInputElement).checked)"
      />Aa</label
    >
    <span>{{ count ? `${index + 1} / ${count}` : t('No matches') }}</span>
    <button :disabled="!count" :aria-label="t('Previous')" @click="emit('next', -1)">↑</button>
    <button :disabled="!count" :aria-label="t('Next')" @click="emit('next', 1)">↓</button>
    <template v-if="replace">
      <input
        :value="replacement"
        :aria-label="t('Replace')"
        :placeholder="t('Replace')"
        @input="emit('replacement', ($event.target as HTMLInputElement).value)"
      />
      <button :disabled="!count" @click="emit('replaceOne')">{{ t('Replace') }}</button>
      <button :disabled="!count" @click="emit('replaceAll')">{{ t('Replace all') }}</button>
    </template>
    <button :aria-label="t('Close')" @click="emit('close')">×</button>
  </section>
</template>
