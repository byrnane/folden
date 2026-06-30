<script setup lang="ts">
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
        This document contains Markdown constructs that Folden may rewrite in Visual mode.
      </p>
      <ul class="dialog-feature-list">
        <li v-for="feature in features" :key="`${feature.kind}-${feature.line ?? 'na'}`">
          <strong>{{ feature.description }}</strong>
          <span v-if="feature.line !== null">Line {{ feature.line }}</span>
        </li>
      </ul>
    </div>

    <template #actions>
      <button type="button" @click="emit('cancel')">
        Stay in Source
      </button>
      <button type="button" class="danger" @click="emit('confirm')">
        Open in Visual Anyway
      </button>
    </template>
  </AppDialog>
</template>
