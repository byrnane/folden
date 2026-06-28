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
import { computed, ref } from 'vue'
import SourceEditor from './SourceEditor.vue'
import {
  createDirectory,
  createFile,
  listDirectory,
  openTextFile,
  openTextFileByPath,
  openWorkspaceDirectory,
  renamePath,
  saveTextFile,
  trashPath,
  type OpenedDocument,
  type WorkspaceEntry,
} from './tauriFiles'
import VisualMarkdownEditor from './VisualMarkdownEditor.vue'
import WorkspaceTree from './WorkspaceTree.vue'

type EditorMode = 'visual' | 'source'

type Workspace = {
  rootPath: string
  name: string
  entries: WorkspaceEntry[]
}

type OpenDocument = {
  id: string
  path: string | null
  name: string
  content: string
  savedContent: string
  mode: EditorMode
}

type EditorPane = {
  id: 'left' | 'right'
  title: string
  documentIds: string[]
  activeDocumentId: string | null
}

const initialText = '# Untitled\n\nStart writing in Folden.\n'
const recentWorkspaceStorageKey = 'folden:recent-workspaces'

const workspace = ref<Workspace | null>(null)
const selectedPath = ref<string | null>(null)
const documents = ref<OpenDocument[]>([
  createDocumentFromContent(null, initialText, 'Untitled.md'),
])
const panes = ref<EditorPane[]>([
  {
    id: 'left',
    title: 'Main',
    documentIds: [documents.value[0].id],
    activeDocumentId: documents.value[0].id,
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

const activePane = computed(() => getPane(activePaneId.value) ?? panes.value[0])
const activeDocument = computed(() => {
  if (!activePane.value?.activeDocumentId) {
    return null
  }

  return getDocument(activePane.value.activeDocumentId)
})
const activePath = computed(() => activeDocument.value?.path ?? null)
const visiblePanes = computed(() =>
  splitEnabled.value ? panes.value : panes.value.filter((pane) => pane.id === 'left'),
)
const dirtyDocuments = computed(() =>
  documents.value.filter((document) => document.content !== document.savedContent),
)
const selectedDirectoryPath = computed(() => {
  if (!workspace.value) {
    return null
  }

  if (!selectedPath.value) {
    return workspace.value.rootPath
  }

  const entry = findEntry(workspace.value.entries, selectedPath.value)

  if (!entry) {
    return workspace.value.rootPath
  }

  if (entry.kind === 'directory') {
    return entry.path
  }

  return parentPath(entry.path) ?? workspace.value.rootPath
})

function createDocumentFromContent(
  path: string | null,
  content: string,
  fallbackName?: string,
): OpenDocument {
  return {
    id: crypto.randomUUID(),
    path,
    name: path ? fileNameFromPath(path) : fallbackName ?? 'Untitled.md',
    content,
    savedContent: content,
    mode: path && !isMarkdownPath(path) ? 'source' : 'visual',
  }
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).at(-1) || path
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

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getPane(id: EditorPane['id']) {
  return panes.value.find((pane) => pane.id === id) ?? null
}

function getDocument(id: string) {
  return documents.value.find((document) => document.id === id) ?? null
}

function findDocumentByPath(path: string) {
  return documents.value.find((document) => document.path === path) ?? null
}

function isDirty(document: OpenDocument) {
  return document.content !== document.savedContent
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

function openLoadedDocument(document: OpenedDocument, paneId = activePaneId.value) {
  const existingDocument = findDocumentByPath(document.path)

  if (existingDocument) {
    addDocumentToPane(existingDocument, paneId)
    return existingDocument
  }

  const openDocument = createDocumentFromContent(document.path, document.content)
  documents.value.push(openDocument)
  addDocumentToPane(openDocument, paneId)
  return openDocument
}

function createScratchDocument() {
  const document = createDocumentFromContent(null, '# Untitled\n\n', 'Untitled.md')
  documents.value.push(document)
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
    const rootPath = await openWorkspaceDirectory()

    if (!rootPath) {
      return
    }

    await loadWorkspace(rootPath)
  }, 'Could not open workspace')
}

async function loadWorkspace(rootPath: string) {
  const entries = await listDirectory(rootPath, rootPath)
  workspace.value = {
    rootPath,
    name: workspaceNameFromPath(rootPath),
    entries,
  }
  selectedPath.value = rootPath
  saveRecentWorkspaces([rootPath, ...recentWorkspaces.value])
}

async function refreshWorkspace() {
  if (!workspace.value) {
    return
  }

  workspace.value.entries = await listDirectory(workspace.value.rootPath, workspace.value.rootPath)
}

async function openWorkspaceFile(entry: WorkspaceEntry, paneId = activePaneId.value) {
  if (!workspace.value || entry.kind !== 'file') {
    return
  }

  selectedPath.value = entry.path

  await runFileTask(async () => {
    const document = await openTextFileByPath(workspace.value!.rootPath, entry.path)
    openLoadedDocument(document, paneId)
  }, 'Could not open workspace file')
}

async function openEntryInRight(entry: WorkspaceEntry) {
  splitEnabled.value = true
  await openWorkspaceFile(entry, 'right')
}

function moveActiveDocumentToRight() {
  const document = activeDocument.value
  const sourcePane = activePane.value
  const targetPane = getPane('right')

  if (!document || !sourcePane || !targetPane || sourcePane.id === 'right') {
    splitEnabled.value = true
    return
  }

  splitEnabled.value = true
  addDocumentToPane(document, 'right')
  sourcePane.documentIds = sourcePane.documentIds.filter((documentId) => documentId !== document.id)
  sourcePane.activeDocumentId = sourcePane.documentIds.at(-1) ?? null
}

async function saveDocument(document = activeDocument.value) {
  if (!document) {
    return
  }

  await runFileTask(async () => {
    const savedPath = await saveTextFile(document.path, document.content)

    if (!savedPath) {
      return
    }

    document.path = savedPath
    document.name = fileNameFromPath(savedPath)
    document.savedContent = document.content

    if (!isMarkdownPath(savedPath)) {
      document.mode = 'source'
    }

    await refreshWorkspace()
  }, 'Could not save file')
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

  if (pane.activeDocumentId === documentId) {
    pane.activeDocumentId = pane.documentIds.at(-1) ?? null
  }

  if (!panes.value.some((openPane) => openPane.documentIds.includes(documentId))) {
    documents.value = documents.value.filter((openDocument) => openDocument.id !== documentId)
  }
}

function setDocumentMode(document: OpenDocument, mode: EditorMode) {
  if (mode === 'visual' && !isMarkdownPath(document.path)) {
    return
  }

  document.mode = mode
}

function updateDocumentContent(documentId: string | null, value: string) {
  if (!documentId) {
    return
  }

  const document = getDocument(documentId)

  if (!document) {
    return
  }

  document.content = value
}

async function createWorkspaceFile(parentPath = selectedDirectoryPath.value) {
  if (!workspace.value || !parentPath) {
    return
  }

  const name = window.prompt('New file name', 'Untitled.md')

  if (!name?.trim()) {
    return
  }

  await runFileTask(async () => {
    const path = await createFile(workspace.value!.rootPath, parentPath, name.trim())
    await refreshWorkspace()
    const document = await openTextFileByPath(workspace.value!.rootPath, path)
    openLoadedDocument(document)
  }, 'Could not create file')
}

async function createWorkspaceDirectory(parentPath = selectedDirectoryPath.value) {
  if (!workspace.value || !parentPath) {
    return
  }

  const name = window.prompt('New folder name', 'New Folder')

  if (!name?.trim()) {
    return
  }

  await runFileTask(async () => {
    await createDirectory(workspace.value!.rootPath, parentPath, name.trim())
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
    const nextPath = await renamePath(workspace.value!.rootPath, entry.path, newName.trim())
    updateOpenDocumentPaths(entry.path, nextPath)
    selectedPath.value = nextPath
    await refreshWorkspace()
  }, 'Could not rename path')
}

async function trashWorkspacePath(entry: WorkspaceEntry) {
  if (!workspace.value) {
    return
  }

  const affectedDocuments = documents.value.filter((document) =>
    document.path ? isSameOrChildPath(document.path, entry.path) : false,
  )
  const hasDirtyDocument = affectedDocuments.some(isDirty)
  const prompt = hasDirtyDocument
    ? `Move ${entry.name} to trash and close unsaved files?`
    : `Move ${entry.name} to trash?`

  if (!window.confirm(prompt)) {
    return
  }

  await runFileTask(async () => {
    await trashPath(workspace.value!.rootPath, entry.path)
    removeDocuments(affectedDocuments.map((document) => document.id))
    selectedPath.value = workspace.value!.rootPath
    await refreshWorkspace()
  }, 'Could not move path to trash')
}

function updateOpenDocumentPaths(previousPath: string, nextPath: string) {
  for (const document of documents.value) {
    if (!document.path || !isSameOrChildPath(document.path, previousPath)) {
      continue
    }

    document.path = document.path === previousPath
      ? nextPath
      : `${nextPath}${document.path.slice(previousPath.length)}`
    document.name = fileNameFromPath(document.path)
  }
}

function removeDocuments(documentIds: string[]) {
  const documentIdSet = new Set(documentIds)
  documents.value = documents.value.filter((document) => !documentIdSet.has(document.id))

  for (const pane of panes.value) {
    pane.documentIds = pane.documentIds.filter((documentId) => !documentIdSet.has(documentId))

    if (pane.activeDocumentId && documentIdSet.has(pane.activeDocumentId)) {
      pane.activeDocumentId = pane.documentIds.at(-1) ?? null
    }
  }
}

function isSameOrChildPath(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}\\`) || path.startsWith(`${parent}/`)
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
</script>

<template>
  <main class="app-shell">
    <aside class="workspace-sidebar" aria-label="Workspace">
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

      <WorkspaceTree
        v-if="workspace"
        :entries="workspace.entries"
        :active-path="activePath"
        :selected-path="selectedPath"
        @open-file="openWorkspaceFile"
        @select-path="selectedPath = $event.path"
        @create-file="createWorkspaceFile($event.path)"
        @create-directory="createWorkspaceDirectory($event.path)"
        @rename-path="renameWorkspacePath"
        @trash-path="trashWorkspacePath"
      />

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
            @click="runFileTask(() => loadWorkspace(path), 'Could not open recent workspace')"
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
            @click="splitEnabled = !splitEnabled"
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
                :class="{ active: getDocument(pane.activeDocumentId)?.mode === 'visual' }"
                :disabled="!isMarkdownPath(getDocument(pane.activeDocumentId)?.path ?? null)"
                @click="setDocumentMode(getDocument(pane.activeDocumentId)!, 'visual')"
              >
                Visual
              </button>
              <button
                type="button"
                :class="{ active: getDocument(pane.activeDocumentId)?.mode === 'source' }"
                @click="setDocumentMode(getDocument(pane.activeDocumentId)!, 'source')"
              >
                Source
              </button>
              <button
                v-if="workspace && getDocument(pane.activeDocumentId)?.path"
                type="button"
                class="open-right-button"
                @click="
                  openEntryInRight({
                    name: getDocument(pane.activeDocumentId)!.name,
                    path: getDocument(pane.activeDocumentId)!.path!,
                    kind: 'file',
                    children: [],
                  })
                "
              >
                Open Right
              </button>
            </div>

            <VisualMarkdownEditor
              v-if="getDocument(pane.activeDocumentId)?.mode === 'visual'"
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
        <span class="path-status">{{ activeDocument?.path ?? 'Scratch document' }}</span>
        <span>{{ activeDocument ? `${activeDocument.content.length} chars` : 'No document' }}</span>
      </footer>
    </section>
  </main>
</template>
