<script setup lang="ts">
import {
  Columns2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  PanelRightOpen,
  Save,
  X,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SourceEditor from './SourceEditor.vue'
import {
  createDirectory,
  createFile,
  listDirectory,
  openTextFile,
  openTextFileByPath,
  openWorkspaceDirectory,
  renamePath,
  restoreWorkspaceByPath,
  saveTextFile,
  trashPath,
  type OpenedDocument,
  type WorkspaceDescriptor,
  type WorkspaceEntry,
} from './tauriFiles'
import { createDocumentState, type EditorMode, type OpenDocument } from './documentState'
import { createTextFileFormat, isDocumentDirty } from './domain/document'
import { createDocumentSaveQueue } from './saveQueue'
import VisualMarkdownEditor from './VisualMarkdownEditor.vue'
import WorkspaceTree from './WorkspaceTree.vue'

type Workspace = {
  id: string
  rootPath: string
  name: string
  entries: WorkspaceEntry[]
}

type EditorPane = {
  id: 'left' | 'right'
  title: string
  documentIds: string[]
  activeDocumentId: string | null
}

const initialText = '# Untitled\n\nStart writing in Folden.\n'
const recentWorkspaceStorageKey = 'folden:recent-workspaces'
const documentState = createDocumentState({
  fileNameFromPath,
  isMarkdownPath,
  normalizePath,
})
const {
  documents,
  dirtyDocuments,
  getDocument,
  createScratchDocument: createDocumentDraft,
  openLoadedDocument: openDocumentState,
  updateDocumentContent,
  markDocumentQueued,
  markDocumentSaving,
  markDocumentSaved,
  markDocumentSaveError,
  updateDocumentPaths,
  removeDocuments,
} = documentState
const initialDocument = createDocumentDraft(initialText, 'Untitled.md')

const workspace = ref<Workspace | null>(null)
const selectedPath = ref<string | null>(null)
const panes = ref<EditorPane[]>([
  {
    id: 'left',
    title: 'Main',
    documentIds: [initialDocument.id],
    activeDocumentId: initialDocument.id,
  },
  {
    id: 'right',
    title: 'Split',
    documentIds: [],
    activeDocumentId: null,
  },
])
const activePaneId = ref<EditorPane['id']>('left')
const splitEnabled = ref(false)
const errorMessage = ref<string | null>(null)
const isFileBusy = ref(false)
const recentWorkspaces = ref(loadRecentWorkspaces())
const paneDocumentModes = ref<Record<string, EditorMode>>({})
const saveQueue = createDocumentSaveQueue({
  performSave: (job) => saveTextFile(
    job.documentNativeId,
    job.contentSnapshot,
    job.expectedFingerprint,
    job.fileFormat,
    job.suggestedFileName,
  ),
  onQueued: (job) => {
    markDocumentQueued(job.documentId)
  },
  onSaving: (job) => {
    markDocumentSaving(job.documentId)
  },
  onSaved: (job, savedDocument) => {
    const nextDocument = markDocumentSaved(job.documentId, job.revision, savedDocument)

    if (!nextDocument) {
      return
    }

    if (nextDocument.workspaceId === workspace.value?.id) {
      selectedPath.value = nextDocument.relativePath
    }

    const didPathChange = job.pathBeforeSave !== savedDocument.path
      || job.relativePathBeforeSave !== savedDocument.relativePath
      || job.workspaceIdBeforeSave !== savedDocument.workspaceId

    if (didPathChange && nextDocument.workspaceId === workspace.value?.id) {
      void refreshWorkspace()
    }
  },
  onError: (job, error) => {
    markDocumentSaveError(job.documentId, error)
  },
})

const activePane = computed(() => getPane(activePaneId.value) ?? panes.value[0])
const activeDocument = computed(() => {
  if (!activePane.value?.activeDocumentId) {
    return null
  }

  return getDocument(activePane.value.activeDocumentId)
})
const activePath = computed(() => {
  if (!workspace.value || activeDocument.value?.workspaceId !== workspace.value.id) {
    return null
  }

  return activeDocument.value.relativePath
})
const activeLocation = computed(() => {
  if (!activeDocument.value?.path) {
    return 'Scratch'
  }

  return cleanDisplayPath(activeDocument.value.path)
})
const visiblePanes = computed(() =>
  splitEnabled.value ? panes.value : panes.value.filter((pane) => pane.id === 'left'),
)
const selectedDirectoryPath = computed(() => {
  if (!workspace.value) {
    return null
  }

  if (!selectedPath.value) {
    return ''
  }

  const entry = findEntry(workspace.value.entries, selectedPath.value)

  if (!entry) {
    return ''
  }

  if (entry.kind === 'directory') {
    return entry.path
  }

  return parentPath(entry.path) ?? ''
})

function fileNameFromPath(path: string) {
  return cleanDisplayPath(path).split(/[\\/]/).at(-1) || path
}

function workspaceNameFromPath(path: string) {
  return fileNameFromPath(path) || path
}

function parentPath(path: string) {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))

  if (index <= 0) {
    return null
  }

  return path.slice(0, index)
}

function isMarkdownPath(path: string | null) {
  if (!path) {
    return true
  }

  return /\.(md|markdown)$/i.test(path)
}

function cleanDisplayPath(path: string) {
  if (path.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${path.slice('\\\\?\\UNC\\'.length)}`
  }

  if (path.startsWith('\\\\?\\')) {
    return path.slice('\\\\?\\'.length)
  }

  return path
}

function normalizePath(path: string) {
  return cleanDisplayPath(path).replaceAll('/', '\\').toLowerCase()
}

function joinWorkspacePath(rootPath: string, relativePath: string | null) {
  if (!relativePath) {
    return rootPath
  }

  return `${rootPath.replace(/[\\/]+$/u, '')}\\${relativePath.replace(/^[\\/]+/u, '')}`
}

function formatError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'userMessage' in error &&
    typeof (error as { userMessage?: unknown }).userMessage === 'string'
  ) {
    return (error as { userMessage: string }).userMessage
  }

  return error instanceof Error ? error.message : String(error)
}

function getPane(id: EditorPane['id']) {
  return panes.value.find((pane) => pane.id === id) ?? null
}

function isDirty(document: OpenDocument) {
  return isDocumentDirty(document)
}

function loadRecentWorkspaces() {
  const rawValue = window.localStorage.getItem(recentWorkspaceStorageKey)

  if (!rawValue) {
    return []
  }

  try {
    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

function saveRecentWorkspaces(paths: string[]) {
  recentWorkspaces.value = [...new Set(paths)].slice(0, 6)
  window.localStorage.setItem(recentWorkspaceStorageKey, JSON.stringify(recentWorkspaces.value))
}

function findEntry(entries: WorkspaceEntry[], path: string): WorkspaceEntry | null {
  for (const entry of entries) {
    if (entry.path === path) {
      return entry
    }

    const child = findEntry(entry.children, path)

    if (child) {
      return child
    }
  }

  return null
}

function setActivePane(paneId: EditorPane['id']) {
  activePaneId.value = paneId
}

function clearSidebarSelection() {
  selectedPath.value = null
}

function paneDocumentModeKey(paneId: EditorPane['id'], documentId: string) {
  return `${paneId}:${documentId}`
}

function getDocumentMode(pane: EditorPane, document: OpenDocument) {
  return paneDocumentModes.value[paneDocumentModeKey(pane.id, document.id)] ?? document.defaultMode
}

function setPaneDocumentMode(pane: EditorPane, document: OpenDocument, mode: EditorMode) {
  if (mode === 'visual' && !isMarkdownPath(document.path)) {
    return
  }

  paneDocumentModes.value = {
    ...paneDocumentModes.value,
    [paneDocumentModeKey(pane.id, document.id)]: mode,
  }
}

function setActiveDocument(pane: EditorPane, documentId: string) {
  pane.activeDocumentId = documentId
  activePaneId.value = pane.id
}

function addDocumentToPane(document: OpenDocument, paneId = activePaneId.value) {
  const pane = getPane(paneId)

  if (!pane) {
    return
  }

  if (!pane.documentIds.includes(document.id)) {
    pane.documentIds.push(document.id)
  }

  setActiveDocument(pane, document.id)
}

function setSplitEnabled(enabled: boolean) {
  if (enabled) {
    splitEnabled.value = true
    return
  }

  mergeRightPaneIntoLeft()
  splitEnabled.value = false
  activePaneId.value = 'left'
}

function mergeRightPaneIntoLeft() {
  const leftPane = getPane('left')
  const rightPane = getPane('right')
  const nextPaneDocumentModes = { ...paneDocumentModes.value }

  if (!leftPane || !rightPane) {
    return
  }

  for (const documentId of rightPane.documentIds) {
    if (!leftPane.documentIds.includes(documentId)) {
      leftPane.documentIds.push(documentId)
    }

    const rightMode = paneDocumentModes.value[paneDocumentModeKey('right', documentId)]

    if (rightMode) {
      nextPaneDocumentModes[paneDocumentModeKey('left', documentId)] = rightMode
    }

    delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
  }

  if (rightPane.activeDocumentId) {
    leftPane.activeDocumentId = rightPane.activeDocumentId
  } else if (!leftPane.activeDocumentId) {
    leftPane.activeDocumentId = leftPane.documentIds.at(-1) ?? null
  }

  rightPane.documentIds = []
  rightPane.activeDocumentId = null
  paneDocumentModes.value = nextPaneDocumentModes
}

function openLoadedDocument(document: OpenedDocument, paneId = activePaneId.value) {
  const openDocument = openDocumentState(document)
  addDocumentToPane(openDocument, paneId)
  return openDocument
}

function createScratchDocument() {
  const document = createDocumentDraft('# Untitled\n\n', 'Untitled.md')
  addDocumentToPane(document)
}

async function openNativeDocument() {
  await runFileTask(async () => {
    const document = await openTextFile()

    if (document) {
      openLoadedDocument(document)
    }
  }, 'Could not open file')
}

async function openWorkspace() {
  await runFileTask(async () => {
    const descriptor = await openWorkspaceDirectory()

    if (!descriptor) {
      return
    }

    await loadWorkspace(descriptor)
  }, 'Could not open workspace')
}

async function loadWorkspace(descriptor: WorkspaceDescriptor) {
  const entries = await listDirectory(descriptor.id, '')
  workspace.value = {
    id: descriptor.id,
    rootPath: descriptor.rootPath,
    name: descriptor.name,
    entries,
  }
  selectedPath.value = null
  saveRecentWorkspaces([descriptor.rootPath, ...recentWorkspaces.value])
}

async function refreshWorkspace() {
  if (!workspace.value) {
    return
  }

  workspace.value.entries = await listDirectory(workspace.value.id, '')
}

async function openWorkspaceFile(entry: WorkspaceEntry, paneId = activePaneId.value) {
  if (!workspace.value || entry.kind !== 'file') {
    return
  }

  selectedPath.value = entry.path

  await runFileTask(async () => {
    const document = await openTextFileByPath(workspace.value!.id, entry.path)
    openLoadedDocument(document, paneId)
  }, 'Could not open workspace file')
}

async function openEntryInRight(entry: WorkspaceEntry) {
  setSplitEnabled(true)
  await openWorkspaceFile(entry, 'right')
}

function moveActiveDocumentToRight() {
  const document = activeDocument.value
  const sourcePane = activePane.value
  const targetPane = getPane('right')

  if (!document || !sourcePane || !targetPane || sourcePane.id === 'right') {
    setSplitEnabled(true)
    return
  }

  setSplitEnabled(true)
  addDocumentToPane(document, 'right')
  sourcePane.documentIds = sourcePane.documentIds.filter((documentId) => documentId !== document.id)
  sourcePane.activeDocumentId = sourcePane.documentIds.at(-1) ?? null
}

async function saveDocument(document = activeDocument.value) {
  if (!document) {
    return
  }

  await runFileTask(async () => {
    await saveQueue.enqueue({
      documentId: document.id,
      documentNativeId: document.nativeId,
      pathBeforeSave: document.path,
      workspaceIdBeforeSave: document.workspaceId,
      relativePathBeforeSave: document.relativePath,
      revision: document.revision,
      contentSnapshot: document.content,
      expectedFingerprint: document.diskFingerprint,
      fileFormat: document.fileFormat ?? createTextFileFormat(),
      suggestedFileName: document.nativeId ? undefined : suggestFileName(document.content),
      reason: 'manual',
    })
  }, 'Could not save file')
}

function suggestFileName(content: string) {
  return `${safeFileBaseName(readMarkdownTitle(content))}.md`
}

function readMarkdownTitle(content: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]
  const fallbackText = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return heading ?? fallbackText ?? 'Untitled'
}

function safeFileBaseName(source: string) {
  const cleanName = source
    .replace(/^[#>*\-\s]+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .replace(/[.\s]+$/g, '')

  return cleanName || 'Untitled'
}

function closeDocument(pane: EditorPane, documentId: string) {
  const document = getDocument(documentId)

  if (!document) {
    return
  }

  if (isDirty(document) && !window.confirm(`Close ${document.name} without saving?`)) {
    return
  }

  pane.documentIds = pane.documentIds.filter((id) => id !== documentId)
  const nextPaneDocumentModes = { ...paneDocumentModes.value }
  delete nextPaneDocumentModes[paneDocumentModeKey(pane.id, documentId)]

  if (pane.activeDocumentId === documentId) {
    pane.activeDocumentId = pane.documentIds.at(-1) ?? null
  }

  if (!panes.value.some((openPane) => openPane.documentIds.includes(documentId))) {
    removeDocuments([documentId])
    delete nextPaneDocumentModes[paneDocumentModeKey('left', documentId)]
    delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
  }

  paneDocumentModes.value = nextPaneDocumentModes
}

async function createWorkspaceFile(parentPath = selectedDirectoryPath.value) {
  if (!workspace.value || parentPath === null) {
    return
  }

  const name = window.prompt('New file name', 'Untitled.md')

  if (!name?.trim()) {
    return
  }

  await runFileTask(async () => {
    const path = await createFile(workspace.value!.id, parentPath, name.trim())
    await refreshWorkspace()
    const document = await openTextFileByPath(workspace.value!.id, path)
    openLoadedDocument(document)
  }, 'Could not create file')
}

async function createWorkspaceDirectory(parentPath = selectedDirectoryPath.value) {
  if (!workspace.value || parentPath === null) {
    return
  }

  const name = window.prompt('New folder name', 'New Folder')

  if (!name?.trim()) {
    return
  }

  await runFileTask(async () => {
    await createDirectory(workspace.value!.id, parentPath, name.trim())
    await refreshWorkspace()
  }, 'Could not create folder')
}

async function renameWorkspacePath(entry: WorkspaceEntry) {
  if (!workspace.value) {
    return
  }

  const newName = window.prompt('Rename', entry.name)

  if (!newName?.trim() || newName.trim() === entry.name) {
    return
  }

  await runFileTask(async () => {
    const nextPath = await renamePath(workspace.value!.id, entry.path, newName.trim())
    updateDocumentPaths(entry.path, nextPath)
    for (const document of documents.value) {
      if (document.workspaceId !== workspace.value?.id || !document.relativePath) {
        continue
      }

      if (!isSameOrChildPath(document.relativePath, entry.path)) {
        continue
      }

      document.path = joinWorkspacePath(workspace.value.rootPath, document.relativePath)
    }
    selectedPath.value = nextPath
    await refreshWorkspace()
  }, 'Could not rename path')
}

async function trashWorkspacePath(entry: WorkspaceEntry) {
  if (!workspace.value) {
    return
  }

  const workspaceId = workspace.value.id
  const affectedDocuments = documents.value.filter((document) =>
    document.workspaceId === workspaceId &&
    document.relativePath ? isSameOrChildPath(document.relativePath, entry.path) : false,
  )
  const hasDirtyDocument = affectedDocuments.some(isDirty)
  const prompt = hasDirtyDocument
    ? `Move ${entry.name} to trash and close unsaved files?`
    : `Move ${entry.name} to trash?`

  if (!window.confirm(prompt)) {
    return
  }

  await runFileTask(async () => {
    await trashPath(workspace.value!.id, entry.path)
    removeDocumentsFromPanes(affectedDocuments.map((document) => document.id))
    selectedPath.value = null
    await refreshWorkspace()
  }, 'Could not move path to trash')
}

function removeDocumentsFromPanes(documentIds: string[]) {
  const documentIdSet = new Set(documentIds)

  for (const pane of panes.value) {
    pane.documentIds = pane.documentIds.filter((documentId) => !documentIdSet.has(documentId))

    if (pane.activeDocumentId && documentIdSet.has(pane.activeDocumentId)) {
      pane.activeDocumentId = pane.documentIds.at(-1) ?? null
    }
  }

  const nextPaneDocumentModes = { ...paneDocumentModes.value }

  for (const documentId of documentIds) {
    delete nextPaneDocumentModes[paneDocumentModeKey('left', documentId)]
    delete nextPaneDocumentModes[paneDocumentModeKey('right', documentId)]
  }

  paneDocumentModes.value = nextPaneDocumentModes
  removeDocuments(documentIds)
}

function isSameOrChildPath(path: string, parent: string) {
  const normalizedPath = normalizePath(path)
  const normalizedParent = normalizePath(parent)

  return (
    normalizedPath === normalizedParent ||
    normalizedPath.startsWith(`${normalizedParent}\\`)
  )
}

async function runFileTask(task: () => Promise<void>, message: string) {
  errorMessage.value = null
  isFileBusy.value = true

  try {
    await task()
  } catch (error) {
    errorMessage.value = `${message}: ${formatError(error)}`
  } finally {
    isFileBusy.value = false
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const hasModifier = event.ctrlKey || event.metaKey

  if (!hasModifier) {
    return
  }

  const code = event.code

  if (code === 'KeyS') {
    event.preventDefault()
    void saveDocument()
    return
  }

  if (code === 'KeyO' && event.shiftKey) {
    event.preventDefault()
    void openWorkspace()
    return
  }

  if (code === 'KeyO') {
    event.preventDefault()
    void openNativeDocument()
    return
  }

  if (code === 'KeyN') {
    event.preventDefault()
    createScratchDocument()
    return
  }

  if (code === 'Backslash') {
    event.preventDefault()
    setSplitEnabled(!splitEnabled.value)
    return
  }

  if (code === 'ArrowRight' && event.shiftKey) {
    event.preventDefault()
    moveActiveDocumentToRight()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <main class="app-shell">
    <aside class="workspace-sidebar" aria-label="Workspace" @click.self="clearSidebarSelection">
      <div class="workspace-header">
        <div>
          <p class="app-kicker">Folden</p>
          <h1>{{ workspace?.name ?? 'No workspace' }}</h1>
        </div>
        <button
          type="button"
          class="icon-button"
          title="Open folder"
          :disabled="isFileBusy"
          @click="openWorkspace"
        >
          <FolderOpen :size="17" />
        </button>
      </div>

      <div class="workspace-actions">
        <button type="button" class="icon-button" title="New scratch document" @click="createScratchDocument">
          <FilePlus :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="New file"
          :disabled="!workspace"
          @click="createWorkspaceFile()"
        >
          <FilePlus :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="New folder"
          :disabled="!workspace"
          @click="createWorkspaceDirectory()"
        >
          <FolderPlus :size="16" />
        </button>
      </div>

      <div v-if="workspace" class="workspace-root" :title="workspace.rootPath">
        {{ workspace.rootPath }}
      </div>

      <div
        v-if="workspace"
        class="workspace-tree-shell"
        @click.self="clearSidebarSelection"
      >
        <WorkspaceTree
          :entries="workspace.entries"
          :active-path="activePath"
          :selected-path="selectedPath"
          @clear-selection="clearSidebarSelection"
          @open-file="openWorkspaceFile"
          @select-path="selectedPath = $event.path"
          @create-file="createWorkspaceFile($event.path)"
          @create-directory="createWorkspaceDirectory($event.path)"
          @rename-path="renameWorkspacePath"
          @trash-path="trashWorkspacePath"
        />
      </div>

      <section v-else class="empty-sidebar">
        <p>Open a folder to start a workspace.</p>
        <button type="button" :disabled="isFileBusy" @click="openWorkspace">Open Folder</button>

        <div v-if="recentWorkspaces.length" class="recent-workspaces">
          <p class="sidebar-label">Recent</p>
          <button
            v-for="path in recentWorkspaces"
            :key="path"
            type="button"
            class="recent-workspace"
            :title="path"
            @click="
              runFileTask(
                async () => loadWorkspace(await restoreWorkspaceByPath(path)),
                'Could not open recent workspace',
              )
            "
          >
            {{ workspaceNameFromPath(path) }}
          </button>
        </div>
      </section>
    </aside>

    <section class="workbench">
      <header class="topbar">
        <div class="topbar-title">
          <span class="document-title">{{ activeDocument?.name ?? 'No document' }}</span>
          <span v-if="dirtyDocuments.length" class="dirty-marker">
            {{ dirtyDocuments.length }} unsaved
          </span>
        </div>

        <div class="topbar-actions">
          <button type="button" title="Open file" :disabled="isFileBusy" @click="openNativeDocument">
            Open
          </button>
          <button
            type="button"
            class="icon-button"
            title="Save"
            :disabled="isFileBusy || !activeDocument"
            @click="saveDocument()"
          >
            <Save :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Toggle split view"
            :class="{ active: splitEnabled }"
            @click="setSplitEnabled(!splitEnabled)"
          >
            <Columns2 :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Move active tab right"
            :disabled="!activeDocument"
            @click="moveActiveDocumentToRight"
          >
            <PanelRightOpen :size="16" />
          </button>
        </div>
      </header>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <section class="pane-grid" :class="{ split: splitEnabled }">
        <section
          v-for="pane in visiblePanes"
          :key="pane.id"
          class="editor-pane"
          :class="{ active: activePaneId === pane.id }"
          @click="setActivePane(pane.id)"
        >
          <header class="pane-header">
            <span>{{ pane.title }}</span>
            <div class="pane-tabs">
              <button
                v-for="documentId in pane.documentIds"
                :key="documentId"
                type="button"
                class="tab-button"
                :class="{ active: pane.activeDocumentId === documentId }"
                @click.stop="setActiveDocument(pane, documentId)"
              >
                <span>{{ getDocument(documentId)?.name ?? 'Missing' }}</span>
                <span v-if="getDocument(documentId) && isDirty(getDocument(documentId)!)" class="tab-dot" />
                <X
                  class="tab-close"
                  :size="13"
                  @click.stop="closeDocument(pane, documentId)"
                />
              </button>
            </div>
          </header>

          <template v-if="pane.activeDocumentId && getDocument(pane.activeDocumentId)">
            <div class="mode-switch">
              <button
                type="button"
                :class="{ active: getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual' }"
                :disabled="!isMarkdownPath(getDocument(pane.activeDocumentId)?.path ?? null)"
                @click="setPaneDocumentMode(pane, getDocument(pane.activeDocumentId)!, 'visual')"
              >
                Visual
              </button>
              <button
                type="button"
                :class="{ active: getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'source' }"
                @click="setPaneDocumentMode(pane, getDocument(pane.activeDocumentId)!, 'source')"
              >
                Source
              </button>
              <button
                v-if="pane.id !== 'right' && workspace && getDocument(pane.activeDocumentId)?.relativePath"
                type="button"
                class="open-right-button"
                @click="
                  openEntryInRight({
                    name: getDocument(pane.activeDocumentId)!.name,
                    path: getDocument(pane.activeDocumentId)!.relativePath!,
                    kind: 'file',
                    children: [],
                  })
                "
              >
                Open Right
              </button>
            </div>

            <VisualMarkdownEditor
              v-if="getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual'"
              :model-value="getDocument(pane.activeDocumentId)!.content"
              @update:model-value="updateDocumentContent(pane.activeDocumentId, $event)"
            />
            <section v-else class="source-editor-frame">
              <SourceEditor
                :model-value="getDocument(pane.activeDocumentId)!.content"
                @update:model-value="updateDocumentContent(pane.activeDocumentId, $event)"
              />
            </section>
          </template>

          <div v-else class="empty-pane">
            <p>No open file in this pane.</p>
          </div>
        </section>
      </section>

      <footer class="statusbar">
        <span>{{ documents.length }} open</span>
        <span class="path-status" :title="activeDocument?.path ? cleanDisplayPath(activeDocument.path) : 'Scratch document'">
          {{ activeLocation }}
        </span>
        <span>{{ activeDocument ? `${activeDocument.content.length} chars` : 'No document' }}</span>
      </footer>
    </section>
  </main>
</template>
