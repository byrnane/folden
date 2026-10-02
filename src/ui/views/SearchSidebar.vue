<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { t } from '../../application/i18n'
import type { WorkspaceHit } from '../../application/controllers/searchController'
defineProps<{
  query: string
  matchCase: boolean
  results: WorkspaceHit[]
  busy: boolean
  partial: boolean
  skipped: number
  error: string
  hasWorkspace: boolean
}>()
const emit = defineEmits<{
  query: [value: string]
  matchCase: [value: boolean]
  refresh: []
  open: [hit: WorkspaceHit]
}>()
const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())
</script>
<template>
  <section class="search-sidebar">
    <h1>{{ t('Search') }}</h1>
    <p>{{ t('In Markdown') }}</p>
    <p v-if="!hasWorkspace">{{ t('Open a project folder to search.') }}</p>
    <template v-else>
      <input
        ref="input"
        :value="query"
        :aria-label="t('Search')"
        :placeholder="t('Search')"
        @input="emit('query', ($event.target as HTMLInputElement).value)"
      />
      <div class="search-controls">
        <label
          ><input
            type="checkbox"
            :checked="matchCase"
            @change="emit('matchCase', ($event.target as HTMLInputElement).checked)"
          />{{ t('Match case') }}</label
        ><button @click="emit('refresh')">{{ t('Refresh') }}</button>
      </div>
      <p v-if="busy" role="status">{{ t('Searching…') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="partial || skipped" role="status">
        {{ t('Partial results') }} · {{ t('Skipped files: {count}', { count: skipped }) }}
      </p>
      <p v-if="partial || skipped" class="search-limits">
        {{ t('Limits: 100,000 entries, 32 levels, 2 MiB per file, 5,000 matches.') }}
      </p>
      <p v-if="query && !busy && !results.length">{{ t('No matches') }}</p>
      <button
        v-for="hit in results"
        :key="`${hit.path}:${hit.from}`"
        class="search-result"
        @click="emit('open', hit)"
      >
        <strong>{{ hit.path }}:{{ hit.line }}</strong
        ><span>{{ hit.preview }}</span>
      </button>
    </template>
  </section>
</template>
