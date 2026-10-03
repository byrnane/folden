<script setup lang="ts">
import { ref } from 'vue'
import { version } from '../../../package.json'
import AppDialog from './AppDialog.vue'
import icon from '../../assets/brand/icon.svg'
import { t } from '../../application/i18n'
import { openProjectLink } from '../../infrastructure/tauri/projectLinks'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const legalText = ref('')
const legalTitle = ref('')
const error = ref('')

async function openLink(link: Parameters<typeof openProjectLink>[0]) {
  error.value = ''
  try {
    await openProjectLink(link)
  } catch {
    error.value = t('Could not open the project page.')
  }
}

async function showLegal(kind: 'terms' | 'third-party') {
  error.value = ''
  try {
    legalText.value =
      kind === 'terms'
        ? (await import('../../../LICENSE.md?raw')).default
        : (await import('../../../THIRD_PARTY_NOTICES.md?raw')).default
    legalTitle.value = t(kind === 'terms' ? 'Usage terms' : 'Third-party licenses')
  } catch {
    error.value = t('Could not load license text.')
  }
}
</script>
<template>
  <AppDialog v-if="open" title="About Folden" @keydown.esc="emit('close')">
    <div class="about-brand">
      <img :src="icon" alt="" width="64" height="64" />
      <div>
        <h3>Folden</h3>
        <p>{{ version }} · {{ t('Public beta') }} · byrnane</p>
      </div>
    </div>
    <p>{{ t('A desktop editor for Markdown and text files.') }}</p>
    <p>
      {{
        t(
          'Official builds are free for personal and commercial work. See the usage terms for reading the source and building it on Linux for your own use.',
        )
      }}
    </p>
    <p>
      {{
        t(
          'No accounts or telemetry. Your documents stay on your computer. Remote images load with your permission. You choose when to export diagnostics.',
        )
      }}
    </p>
    <div class="about-links">
      <button type="button" @click="openLink('help')">{{ t('Help') }}</button>
      <button type="button" @click="openLink('releases')">{{ t('Releases') }}</button>
      <button type="button" @click="openLink('issues')">{{ t('Report a problem') }}</button>
      <button type="button" @click="openLink('repository')">{{ t('Source code') }}</button>
      <button type="button" @click="showLegal('terms')">{{ t('Usage terms') }}</button>
      <button type="button" @click="showLegal('third-party')">
        {{ t('Third-party licenses') }}
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <details v-if="legalText" open>
      <summary>{{ legalTitle }}</summary>
      <pre class="about-legal" tabindex="0">{{ legalText }}</pre>
    </details>
    <template #actions
      ><button type="button" @click="emit('close')">{{ t('Close') }}</button></template
    >
  </AppDialog>
</template>
<style scoped>
.about-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}
.about-brand h3 {
  margin: 0;
  font-size: 24px;
}
.about-brand p {
  margin: 4px 0 0;
}
.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.about-legal {
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 12px/1.6 monospace;
}
</style>
