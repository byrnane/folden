<script setup lang="ts">
import { ref, toRaw, watch } from 'vue'
import type { ApplicationSettings } from '../../application/settings'
import { applicationSettingLimits, availableThemes } from '../../application/settings'

type SettingsSection = 'editor' | 'files' | 'appearance'

const props = defineProps<{
  appSettings: ApplicationSettings
  activeSection: SettingsSection
  canExportDiagnostics: boolean
}>()

const emit = defineEmits<{
  updateSettings: [settings: ApplicationSettings]
  resetLayout: []
  exportDiagnostics: []
}>()

const settings = ref(structuredClone(toRaw(props.appSettings)))
const sourceFontSizeInput = ref(String(settings.value.editor.sourceFontSize))
const visualFontSizeInput = ref(String(settings.value.editor.visualFontSize))
const lineHeightInput = ref(String(settings.value.editor.lineHeight))
const visualMaxWidthInput = ref(String(settings.value.editor.visualMaxWidth))
const autosaveDelaySecondsInput = ref(formatSeconds(settings.value.autosave.debounceMs))
const uiScaleInput = ref(String(settings.value.appearance.uiScale))

const autosaveDelaySecondsLimit = secondsLimit(applicationSettingLimits.autosaveDebounceMs)

function inputText(event: Event) {
  return (event.target as HTMLInputElement).value
}

function formatSeconds(milliseconds: number) {
  return String(milliseconds / 1000)
}

function secondsLimit(millisecondsLimit: {
  min: number
  max: number
  fallback: number
  step: number
}) {
  return {
    min: millisecondsLimit.min / 1000,
    max: millisecondsLimit.max / 1000,
    fallback: millisecondsLimit.fallback / 1000,
    step: millisecondsLimit.step / 1000,
  }
}

function applyNumberInput(value: string, limit: { min: number; max: number; fallback: number }) {
  const numberValue = Number(value)
  const normalized = Number.isFinite(numberValue) ? numberValue : limit.fallback
  return Math.min(Math.max(normalized, limit.min), limit.max)
}

function updateSourceFontSize() {
  settings.value.editor.sourceFontSize = applyNumberInput(
    sourceFontSizeInput.value,
    applicationSettingLimits.sourceFontSize,
  )
  sourceFontSizeInput.value = String(settings.value.editor.sourceFontSize)
}

function updateVisualFontSize() {
  settings.value.editor.visualFontSize = applyNumberInput(
    visualFontSizeInput.value,
    applicationSettingLimits.visualFontSize,
  )
  visualFontSizeInput.value = String(settings.value.editor.visualFontSize)
}

function updateLineHeight() {
  settings.value.editor.lineHeight = applyNumberInput(
    lineHeightInput.value,
    applicationSettingLimits.lineHeight,
  )
  lineHeightInput.value = String(settings.value.editor.lineHeight)
}

function updateVisualMaxWidth() {
  settings.value.editor.visualMaxWidth = applyNumberInput(
    visualMaxWidthInput.value,
    applicationSettingLimits.visualMaxWidth,
  )
  visualMaxWidthInput.value = String(settings.value.editor.visualMaxWidth)
}

function updateAutosaveDebounce() {
  const seconds = applyNumberInput(autosaveDelaySecondsInput.value, autosaveDelaySecondsLimit)
  settings.value.autosave.debounceMs = Math.round(seconds * 1000)
  autosaveDelaySecondsInput.value = formatSeconds(settings.value.autosave.debounceMs)
}

function updateUiScale() {
  settings.value.appearance.uiScale = applyNumberInput(
    uiScaleInput.value,
    applicationSettingLimits.uiScale,
  )
  uiScaleInput.value = String(settings.value.appearance.uiScale)
}

function sameSettings(first: ApplicationSettings, second: ApplicationSettings) {
  return JSON.stringify(first) === JSON.stringify(second)
}

watch(
  settings,
  (value) => {
    if (!sameSettings(value, props.appSettings)) {
      emit('updateSettings', structuredClone(toRaw(value)))
    }
  },
  { deep: true, flush: 'sync' },
)

watch(
  () => props.appSettings,
  (value) => {
    if (!sameSettings(value, settings.value)) {
      settings.value = structuredClone(toRaw(value))
    }
  },
  { deep: true },
)
</script>

<template>
  <section class="settings-view" aria-label="Settings">
    <div class="settings-panel">
      <header class="settings-panel-header">
        <p class="app-kicker">Settings</p>
        <h2>
          {{
            activeSection === 'editor'
              ? 'Editor'
              : activeSection === 'files'
                ? 'Files'
                : 'Appearance'
          }}
        </h2>
      </header>
      <section v-if="activeSection === 'editor'" class="settings-section">
        <label class="settings-row"
          ><span><strong>Source font</strong><small>Font stack for plain text editing.</small></span
          ><input v-model="settings.editor.sourceFontFamily" type="text"
        /></label>
        <label class="settings-row"
          ><span><strong>Source size</strong><small>Text size in Source mode.</small></span
          ><input
            :value="sourceFontSizeInput"
            type="number"
            :min="applicationSettingLimits.sourceFontSize.min"
            :max="applicationSettingLimits.sourceFontSize.max"
            @input="sourceFontSizeInput = inputText($event)"
            @change="updateSourceFontSize"
            @blur="updateSourceFontSize"
        /></label>
        <label class="settings-row"
          ><span><strong>Visual size</strong><small>Text size in Visual mode.</small></span
          ><input
            :value="visualFontSizeInput"
            type="number"
            :min="applicationSettingLimits.visualFontSize.min"
            :max="applicationSettingLimits.visualFontSize.max"
            @input="visualFontSizeInput = inputText($event)"
            @change="updateVisualFontSize"
            @blur="updateVisualFontSize"
        /></label>
        <label class="settings-row"
          ><span><strong>Line height</strong><small>Shared editor line spacing.</small></span
          ><input
            :value="lineHeightInput"
            type="number"
            :min="applicationSettingLimits.lineHeight.min"
            :max="applicationSettingLimits.lineHeight.max"
            :step="applicationSettingLimits.lineHeight.step"
            @input="lineHeightInput = inputText($event)"
            @change="updateLineHeight"
            @blur="updateLineHeight"
        /></label>
        <label class="settings-row"
          ><span><strong>Visual width</strong><small>Maximum readable content width.</small></span
          ><input
            :value="visualMaxWidthInput"
            type="number"
            :min="applicationSettingLimits.visualMaxWidth.min"
            :max="applicationSettingLimits.visualMaxWidth.max"
            @input="visualMaxWidthInput = inputText($event)"
            @change="updateVisualMaxWidth"
            @blur="updateVisualMaxWidth"
        /></label>
        <label class="settings-row settings-toggle-row"
          ><span><strong>Word wrap</strong><small>Wrap long lines in Source mode.</small></span
          ><input v-model="settings.editor.wordWrap" class="settings-switch" type="checkbox"
        /></label>
        <label class="settings-row"
          ><span
            ><strong>Markdown opens as</strong><small>Default mode for Markdown files.</small></span
          ><select v-model="settings.editor.defaultMarkdownMode">
            <option value="visual">Visual</option>
            <option value="source">Source</option>
          </select></label
        >
      </section>
      <section v-else-if="activeSection === 'files'" class="settings-section">
        <label class="settings-row settings-toggle-row"
          ><span
            ><strong>Autosave</strong
            ><small>Save changed existing files after a short pause.</small></span
          ><input v-model="settings.autosave.enabled" class="settings-switch" type="checkbox"
        /></label>
        <label class="settings-row"
          ><span
            ><strong>Autosave delay</strong
            ><small>Delay before autosave starts, in seconds.</small></span
          ><input
            :value="autosaveDelaySecondsInput"
            type="number"
            :min="autosaveDelaySecondsLimit.min"
            :max="autosaveDelaySecondsLimit.max"
            :step="autosaveDelaySecondsLimit.step"
            @input="autosaveDelaySecondsInput = inputText($event)"
            @change="updateAutosaveDebounce"
            @blur="updateAutosaveDebounce"
        /></label>
        <label class="settings-row settings-toggle-row"
          ><span
            ><strong>Save on focus loss</strong
            ><small>Autosave changed existing files when Folden loses focus.</small></span
          ><input
            v-model="settings.autosave.saveOnWindowBlur"
            class="settings-switch"
            type="checkbox"
        /></label>
        <label class="settings-row settings-toggle-row"
          ><span
            ><strong>Save before switching files</strong
            ><small>Autosave the current file before another document becomes active.</small></span
          ><input
            v-model="settings.autosave.saveOnDocumentSwitch"
            class="settings-switch"
            type="checkbox"
        /></label>
      </section>
      <section v-else class="settings-section">
        <label class="settings-row"
          ><span
            ><strong>Theme</strong><small>Visual theme for the application interface.</small></span
          ><select v-model="settings.appearance.theme" data-testid="theme-select">
            <option v-for="theme in availableThemes" :key="theme.id" :value="theme.id">
              {{ theme.label }}
            </option>
          </select></label
        >
        <label class="settings-row"
          ><span
            ><strong>UI scale</strong><small>Scale controls and application chrome.</small></span
          ><input
            :value="uiScaleInput"
            type="number"
            :min="applicationSettingLimits.uiScale.min"
            :max="applicationSettingLimits.uiScale.max"
            :step="applicationSettingLimits.uiScale.step"
            @input="uiScaleInput = inputText($event)"
            @change="updateUiScale"
            @blur="updateUiScale"
        /></label>
        <label class="settings-row"
          ><span><strong>Density</strong><small>Spacing preset for controls.</small></span
          ><select v-model="settings.appearance.density">
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select></label
        >
        <label class="settings-row settings-toggle-row"
          ><span><strong>Status bar</strong><small>Show document stats at the bottom.</small></span
          ><input
            v-model="settings.appearance.showStatusBar"
            class="settings-switch"
            type="checkbox"
        /></label>
        <label class="settings-row settings-toggle-row"
          ><span
            ><strong>Sidebar</strong><small>Show workspace sidebar outside Settings.</small></span
          ><input v-model="settings.appearance.showSidebar" class="settings-switch" type="checkbox"
        /></label>
        <div class="settings-actions">
          <button type="button" @click="emit('resetLayout')">Reset layout</button
          ><button
            type="button"
            :disabled="!canExportDiagnostics"
            data-testid="export-diagnostics"
            @click="emit('exportDiagnostics')"
          >
            Export diagnostics
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
