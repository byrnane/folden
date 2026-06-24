<script setup lang="ts">
import { computed, ref } from 'vue'
import SourceEditor from './SourceEditor.vue'
import { openTextFile, saveTextFile } from './tauriFiles'

const initialText = '# Untitled\n\nStart writing in Folden.\n'

const documentText = ref(initialText)
const savedText = ref(initialText)
const currentPath = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const isFileBusy = ref(false)

const isDirty = computed(() => documentText.value !== savedText.value)
const documentTitle = computed(() => {
  if (!currentPath.value) {
    return 'Untitled'
  }

  return currentPath.value.split(/[\\/]/).at(-1) || currentPath.value
})

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function confirmDiscardChanges() {
  return !isDirty.value || window.confirm('Discard unsaved changes?')
}

function createDocument() {
  if (!confirmDiscardChanges()) {
    return
  }

  documentText.value = ''
  savedText.value = ''
  currentPath.value = null
  errorMessage.value = null
}

async function openDocument() {
  if (!confirmDiscardChanges()) {
    return
  }

  errorMessage.value = null
  isFileBusy.value = true

  try {
    const document = await openTextFile()

    if (!document) {
      return
    }

    documentText.value = document.content
    savedText.value = document.content
    currentPath.value = document.path
  } catch (error) {
    errorMessage.value = `Could not open file: ${formatError(error)}`
  } finally {
    isFileBusy.value = false
  }
}

async function saveDocument() {
  errorMessage.value = null
  isFileBusy.value = true

  try {
    const savedPath = await saveTextFile(currentPath.value, documentText.value)

    if (!savedPath) {
      return
    }

    currentPath.value = savedPath
    savedText.value = documentText.value
  } catch (error) {
    errorMessage.value = `Could not save file: ${formatError(error)}`
  } finally {
    isFileBusy.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <header class="titlebar">
      <div>
        <p class="app-kicker">Folden</p>
        <h1>{{ documentTitle }}</h1>
      </div>

      <div class="titlebar-actions">
        <span v-if="isDirty" class="dirty-marker">Unsaved</span>
        <button type="button" :disabled="isFileBusy" @click="createDocument">New</button>
        <button type="button" :disabled="isFileBusy" @click="openDocument">Open</button>
        <button type="button" :disabled="isFileBusy || !isDirty" @click="saveDocument">Save</button>
      </div>
    </header>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

    <section class="editor-frame" aria-label="Document editor">
      <SourceEditor
        v-model="documentText"
        aria-label="Document text"
      />
    </section>

    <footer class="statusbar">
      <span>{{ documentText.length }} chars</span>
      <span class="path-status">{{ currentPath ?? 'No file selected' }}</span>
      <span>{{ isDirty ? 'Modified' : 'Saved' }}</span>
    </footer>
  </main>
</template>
