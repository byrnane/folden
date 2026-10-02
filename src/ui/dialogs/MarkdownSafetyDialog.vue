<script setup lang="ts">
import { t } from '../../application/i18n'
import AppDialog from './AppDialog.vue'
import type { MarkdownUnsupportedFeature } from '../../domain/markdown/markdownSafety'

defineProps<{
  open: boolean
  title: string
  features: MarkdownUnsupportedFeature[]
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <AppDialog v-if="open" :title="title">
    <div class="dialog-form">
      <p class="app-dialog-message">
        {{
          t('This document contains Markdown constructs that Folden may rewrite in Visual mode.')
        }}
      </p>
      <ul class="dialog-feature-list">
        <li v-for="feature in features" :key="`${feature.kind}-${feature.line ?? 'na'}`">
          <strong>{{ t(feature.description) }}</strong>
          <span v-if="feature.line !== null">{{ t('Line') }} {{ feature.line }}</span>
        </li>
      </ul>
    </div>

    <template #actions>
      <button type="button" @click="emit('cancel')">{{ t('Stay in Source') }}</button>
      <button type="button" class="danger" @click="emit('confirm')">
        {{ t('Open in Visual Anyway') }}
      </button>
    </template>
  </AppDialog>
</template>
