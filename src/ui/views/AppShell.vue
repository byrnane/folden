<script setup lang="ts">
import {
  Bold,
  Columns2,
  Code,
  Eye,
  FileCode2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  LayoutPanelLeft,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  PanelLeftOpen,
  PanelRightOpen,
  Quote,
  RemoveFormatting,
  Save,
  Settings,
  Strikethrough,
  Wrench,
  X,
} from 'lucide-vue-next'
import { computed, ref, watch, type Component } from 'vue'
import ConfirmDialog from '../dialogs/ConfirmDialog.vue'
import ConflictResolutionDialog from '../dialogs/ConflictResolutionDialog.vue'
import MarkdownSafetyDialog from '../dialogs/MarkdownSafetyDialog.vue'
import PromptDialog from '../dialogs/PromptDialog.vue'
import RecoveryDialog from '../dialogs/RecoveryDialog.vue'
import UnsavedChangesDialog from '../dialogs/UnsavedChangesDialog.vue'
import SourceEditor from '../editors/SourceEditor.vue'
import VisualMarkdownEditor from '../editors/VisualMarkdownEditor.vue'
import WorkspaceTree from '../workspace/WorkspaceTree.vue'
import { useApplicationShell, type EditorAdapter, type VisualEditorCommand } from '../../applicationShell'

const {
  activeDocument,
  activeDocumentMode,
  activeDocumentWordCount,
  activeLocation,
  activePaneId,
  activePath,
  appSettings,
  layoutSettings,
  cleanDisplayPath,
  closeDocument,
  canExecuteCommand,
  clearDocumentExternalState,
  clearSidebarSelection,
  confirmDialog,
  conflictDialog,
  createWorkspaceDirectory,
  createWorkspaceFile,
  dirtyDocuments,
  documents,
  errorMessage,
  executeCommand,
  expandedWorkspacePaths,
  getDocument,
  getDocumentMode,
  getViewSessionId,
  handleDocumentUpdate,
  isDirty,
  isMarkdownPath,
  allowRemoteImagesForDocument,
  documentHasRemoteImages,
  loadWorkspace,
  loadingWorkspacePaths,
  markdownSafetyDialog,
  moveDocumentIdBetweenPanes,
  openDroppedPath,
  openConflictResolution,
  openWorkspaceFile,
  promptDialog,
  promptDialogError,
  recentWorkspaces,
  recoveryDialog,
  reloadDocumentFromDisk,
  renameWorkspacePath,
  resolveConfirmDialog,
  resolveConflictDialog,
  resolveMarkdownSafetyDialog,
  resolveRecoveryDialog,
  resolveUnsavedDialog,
  restoreWorkspaceByPath,
  runFileTask,
  saveDocumentAsCopy,
  selectedPath,
  setSelectedPath,
  setActiveDocument,
  setActivePane,
  setPaneDocumentMode,
  setPaneEditorAdapter,
  splitEnabled,
  reorderDocumentInPane,
  resetLayoutSettings,
  runActiveVisualCommand,
  setActivitySection,
  setSidebarWidth,
  setSplitRatio,
  shouldLoadRemoteImages,
  submitPromptDialog,
  cancelPromptDialog,
  toggleFocusMode,
  toggleWorkspaceDirectory,
  trashWorkspacePath,
  unsavedDialog,
  visiblePanes,
  watcherWarning,
  workspace,
  workspaceLoadErrors,
  workspaceNameFromPath,
} = useApplicationShell()

type DragPayload = {
  kind: 'tab' | 'open-editor'
  documentId: string
  paneId: 'left' | 'right'
}

type TabPointerDrag = {
  documentId: string
  sourcePaneId: 'left' | 'right'
  startX: number
  startY: number
  dragging: boolean
}

const openEditorsCollapsed = ref(false)
const activeSettingsSection = ref<'editor' | 'files' | 'appearance'>('editor')
const sidebarResizeStart = ref<{ x: number, width: number } | null>(null)
const splitResizeStart = ref<{ x: number, ratio: number, width: number } | null>(null)
const sourceFontSizeInput = ref(String(appSettings.value.editor.sourceFontSize))
const visualFontSizeInput = ref(String(appSettings.value.editor.visualFontSize))
const lineHeightInput = ref(String(appSettings.value.editor.lineHeight))
const visualMaxWidthInput = ref(String(appSettings.value.editor.visualMaxWidth))
const autosaveDelaySecondsInput = ref(formatSeconds(appSettings.value.autosave.debounceMs))
const uiScaleInput = ref(String(appSettings.value.appearance.uiScale))
const tabPointerDrag = ref<TabPointerDrag | null>(null)
const suppressNextTabClick = ref(false)

const shellStyle = computed(() => ({
  '--sidebar-width': `${layoutSettings.value.sidebarWidth}px`,
  '--split-left': `${layoutSettings.value.splitRatio}fr`,
  '--split-right': `${1 - layoutSettings.value.splitRatio}fr`,
  '--ui-scale': String(clampNumber(appSettings.value.appearance.uiScale, 0.85, 1.25, 1)),
  '--source-font-family': appSettings.value.editor.sourceFontFamily,
  '--source-font-size': `${clampNumber(appSettings.value.editor.sourceFontSize, 10, 28, 14)}px`,
  '--editor-line-height': String(clampNumber(appSettings.value.editor.lineHeight, 1.2, 2.2, 1.65)),
  '--visual-font-size': `${clampNumber(appSettings.value.editor.visualFontSize, 12, 30, 16)}px`,
  '--visual-max-width': `${clampNumber(appSettings.value.editor.visualMaxWidth, 520, 1120, 720)}px`,
}))

const showSidebar = computed(() =>
  !layoutSettings.value.focusMode
  && (
    layoutSettings.value.activeActivitySection === 'settings'
    || (
      appSettings.value.appearance.showSidebar
      && layoutSettings.value.activeActivitySection === 'workspace'
    )
  ),
)

const activePane = computed(() =>
  visiblePanes.value.find((pane) => pane.id === activePaneId.value) ?? visiblePanes.value[0],
)
const activePaneDocument = computed(() => activePane.value?.activeDocumentId
  ? getDocument(activePane.value.activeDocumentId)
  : null)
const activePaneIsRight = computed(() => activePaneId.value === 'right')
const moveActiveTabTitle = computed(() => activePaneIsRight.value ? 'Move active tab left' : 'Move active tab right')
const moveActiveTabIcon = computed(() => activePaneIsRight.value ? PanelLeftOpen : PanelRightOpen)
const showDocumentToolbar = computed(() =>
  (layoutSettings.value.activeActivitySection !== 'settings' || layoutSettings.value.focusMode)
  && activeDocumentMode.value === 'visual'
  && activeDocument.value !== null,
)
const showSettingsView = computed(() =>
  layoutSettings.value.activeActivitySection === 'settings' && !layoutSettings.value.focusMode,
)
const showEditorView = computed(() => !showSettingsView.value)

const visualToolbarCommands: Array<{
  command: VisualEditorCommand
  title: string
  label: string
  icon?: Component
}> = [
  { command: 'heading-1', title: 'Heading 1', label: 'H1', icon: Heading1 },
  { command: 'heading-2', title: 'Heading 2', label: 'H2', icon: Heading2 },
  { command: 'bold', title: 'Bold', label: 'B', icon: Bold },
  { command: 'italic', title: 'Italic', label: 'I', icon: Italic },
  { command: 'strike', title: 'Strike', label: 'S', icon: Strikethrough },
  { command: 'inline-code', title: 'Inline code', label: 'Code', icon: Code },
  { command: 'clear-formatting', title: 'Clear formatting', label: 'Clear', icon: RemoveFormatting },
  { command: 'bullet-list', title: 'Bullet list', label: 'List', icon: List },
  { command: 'ordered-list', title: 'Ordered list', label: '1.', icon: ListOrdered },
  { command: 'quote', title: 'Quote', label: 'Quote', icon: Quote },
  { command: 'code-block', title: 'Code block', label: 'Block', icon: Code },
  { command: 'link', title: 'Link', label: 'Link', icon: LinkIcon },
  { command: 'image', title: 'Image', label: 'Image', icon: ImageIcon },
  { command: 'horizontal-rule', title: 'Horizontal rule', label: 'HR', icon: Minus },
]

function startDocumentDrag(event: DragEvent, payload: DragPayload) {
  event.dataTransfer?.setData('application/x-folden-drag', JSON.stringify(payload))
  event.dataTransfer?.setData('text/plain', payload.documentId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleDocumentDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function readDragPayload(event: DragEvent) {
  const rawValue = event.dataTransfer?.getData('application/x-folden-drag')

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as DragPayload
  } catch {
    return null
  }
}

function handlePaneDrop(event: DragEvent, targetPaneId: 'left' | 'right') {
  const payload = readDragPayload(event)

  if (!payload) {
    const droppedPath = getDroppedPath(event)

    if (droppedPath) {
      event.preventDefault()
      void openDroppedPath(droppedPath, targetPaneId)
    }

    return
  }

  event.preventDefault()
  event.stopPropagation()
  moveDocumentIdBetweenPanes(payload.documentId, payload.paneId, targetPaneId)
}

function getDroppedPath(event: DragEvent) {
  const file = event.dataTransfer?.files.item(0) as (File & {
    path?: string
  }) | null

  return file?.path ?? file?.webkitRelativePath ?? null
}

function handleTabDrop(event: DragEvent, targetPaneId: 'left' | 'right', targetIndex: number) {
  const payload = readDragPayload(event)

  if (!payload) {
    const droppedPath = getDroppedPath(event)

    if (droppedPath) {
      event.preventDefault()
      void openDroppedPath(droppedPath, targetPaneId)
    }

    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (payload.kind === 'tab' && payload.paneId === targetPaneId) {
    reorderDocumentInPane(targetPaneId, payload.documentId, targetIndex)
    return
  }

  moveDocumentIdBetweenPanes(payload.documentId, payload.paneId, targetPaneId, targetIndex)
}

function handleTabListDrop(event: DragEvent, targetPaneId: 'left' | 'right') {
  const pane = visiblePanes.value.find((candidate) => candidate.id === targetPaneId)
  handleTabDrop(event, targetPaneId, pane?.documentIds.length ?? 0)
}

function beginTabPointerDrag(event: PointerEvent, documentId: string, sourcePaneId: 'left' | 'right') {
  if (event.button !== 0) {
    return
  }

  tabPointerDrag.value = {
    documentId,
    sourcePaneId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
  }
}

function getTabDropTarget(event: PointerEvent) {
  const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
  const tabTarget = target?.closest<HTMLElement>('[data-tab-drop-pane]')
  const paneTarget = target?.closest<HTMLElement>('[data-pane-id]')
  const paneId = (tabTarget?.dataset.tabDropPane ?? paneTarget?.dataset.paneId) as 'left' | 'right' | undefined

  if (paneId !== 'left' && paneId !== 'right') {
    return null
  }

  const pane = visiblePanes.value.find((candidate) => candidate.id === paneId)
  const fallbackIndex = pane?.documentIds.length ?? 0
  const rawIndex = tabTarget?.dataset.tabDropIndex
  const targetIndex = rawIndex === undefined ? fallbackIndex : Number(rawIndex)

  return {
    paneId,
    targetIndex: Number.isFinite(targetIndex) ? targetIndex : fallbackIndex,
  }
}

function handleTabPointerMove(event: PointerEvent) {
  const drag = tabPointerDrag.value

  if (!drag) {
    return
  }

  if (
    !drag.dragging
    && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5
  ) {
    return
  }

  drag.dragging = true
  event.preventDefault()
}

function finishTabPointerDrag(event: PointerEvent) {
  const drag = tabPointerDrag.value
  tabPointerDrag.value = null

  if (!drag?.dragging) {
    return
  }

  suppressNextTabClick.value = true
  const target = getTabDropTarget(event)

  if (!target) {
    return
  }

  if (drag.sourcePaneId === target.paneId) {
    reorderDocumentInPane(target.paneId, drag.documentId, target.targetIndex)
    return
  }

  moveDocumentIdBetweenPanes(drag.documentId, drag.sourcePaneId, target.paneId, target.targetIndex)
}

function handleTabClick(pane: typeof visiblePanes.value[number], documentId: string) {
  if (suppressNextTabClick.value) {
    suppressNextTabClick.value = false
    return
  }

  void setActiveDocument(pane, documentId)
}

function closeTabOnAuxClick(event: MouseEvent, pane: typeof visiblePanes.value[number], documentId: string) {
  if (event.button === 1) {
    void closeDocument(pane, documentId)
  }
}

function getDocumentPaneIds(documentId: string) {
  return visiblePanes.value
    .filter((pane) => pane.documentIds.includes(documentId))
    .map((pane) => pane.id)
}

function getDocumentPaneLabel(documentId: string) {
  const paneIds = getDocumentPaneIds(documentId)
  const hasLeft = paneIds.includes('left')
  const hasRight = paneIds.includes('right')

  if (hasLeft && hasRight) {
    return 'L/R'
  }

  if (hasRight) {
    return 'R'
  }

  if (hasLeft) {
    return 'L'
  }

  return '-'
}

function getPrimaryDocumentPane(documentId: string) {
  if (activePane.value?.documentIds.includes(documentId)) {
    return activePane.value
  }

  return visiblePanes.value.find((pane) => pane.documentIds.includes(documentId)) ?? activePane.value
}

function isVisiblePaneDocument(documentId: string) {
  return visiblePanes.value.some((pane) => pane.activeDocumentId === documentId)
}

function isActivePaneDocument(documentId: string) {
  return activePane.value?.activeDocumentId === documentId
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : fallback
}

function inputText(event: Event) {
  return (event.target as HTMLInputElement).value
}

function formatSeconds(milliseconds: number) {
  return String(milliseconds / 1000)
}

function applyNumberInput(value: string, minimum: number, maximum: number, fallback: number) {
  const numberValue = Number(value)
  return clampNumber(Number.isFinite(numberValue) ? numberValue : fallback, minimum, maximum, fallback)
}

function updateSourceFontSize() {
  appSettings.value.editor.sourceFontSize = applyNumberInput(sourceFontSizeInput.value, 10, 28, 14)
  sourceFontSizeInput.value = String(appSettings.value.editor.sourceFontSize)
}

function updateVisualFontSize() {
  appSettings.value.editor.visualFontSize = applyNumberInput(visualFontSizeInput.value, 12, 30, 16)
  visualFontSizeInput.value = String(appSettings.value.editor.visualFontSize)
}

function updateLineHeight() {
  appSettings.value.editor.lineHeight = applyNumberInput(lineHeightInput.value, 1.2, 2.2, 1.65)
  lineHeightInput.value = String(appSettings.value.editor.lineHeight)
}

function updateVisualMaxWidth() {
  appSettings.value.editor.visualMaxWidth = applyNumberInput(visualMaxWidthInput.value, 520, 1120, 720)
  visualMaxWidthInput.value = String(appSettings.value.editor.visualMaxWidth)
}

function updateAutosaveDebounce() {
  const seconds = applyNumberInput(autosaveDelaySecondsInput.value, 0.25, 30, 1.2)
  appSettings.value.autosave.debounceMs = Math.round(seconds * 1000)
  autosaveDelaySecondsInput.value = formatSeconds(appSettings.value.autosave.debounceMs)
}

function updateUiScale() {
  appSettings.value.appearance.uiScale = applyNumberInput(uiScaleInput.value, 0.85, 1.25, 1)
  uiScaleInput.value = String(appSettings.value.appearance.uiScale)
}

function beginSidebarResize(event: MouseEvent) {
  sidebarResizeStart.value = {
    x: event.clientX,
    width: layoutSettings.value.sidebarWidth,
  }
  window.addEventListener('mousemove', resizeSidebar)
  window.addEventListener('mouseup', stopSidebarResize, { once: true })
}

function resizeSidebar(event: MouseEvent) {
  if (sidebarResizeStart.value) {
    setSidebarWidth(sidebarResizeStart.value.width + event.clientX - sidebarResizeStart.value.x)
  }
}

function stopSidebarResize() {
  sidebarResizeStart.value = null
  window.removeEventListener('mousemove', resizeSidebar)
}

function beginSplitResize(event: MouseEvent) {
  const parent = (event.currentTarget as HTMLElement).parentElement

  splitResizeStart.value = {
    x: event.clientX,
    ratio: layoutSettings.value.splitRatio,
    width: parent?.clientWidth ?? window.innerWidth,
  }
  window.addEventListener('mousemove', resizeSplit)
  window.addEventListener('mouseup', stopSplitResize, { once: true })
}

function resizeSplit(event: MouseEvent) {
  if (splitResizeStart.value) {
    setSplitRatio(splitResizeStart.value.ratio + (event.clientX - splitResizeStart.value.x) / splitResizeStart.value.width)
  }
}

function stopSplitResize() {
  splitResizeStart.value = null
  window.removeEventListener('mousemove', resizeSplit)
}

watch(() => appSettings.value.editor.sourceFontSize, (value) => {
  sourceFontSizeInput.value = String(value)
})
watch(() => appSettings.value.editor.visualFontSize, (value) => {
  visualFontSizeInput.value = String(value)
})
watch(() => appSettings.value.editor.lineHeight, (value) => {
  lineHeightInput.value = String(value)
})
watch(() => appSettings.value.editor.visualMaxWidth, (value) => {
  visualMaxWidthInput.value = String(value)
})
watch(() => appSettings.value.autosave.debounceMs, (value) => {
  autosaveDelaySecondsInput.value = formatSeconds(value)
})
watch(() => appSettings.value.appearance.uiScale, (value) => {
  uiScaleInput.value = String(value)
})
</script>

<template>
  <main
    class="app-shell"
    :class="{
      'focus-mode': layoutSettings.focusMode,
      'sidebar-hidden': !showSidebar,
      'activity-hidden': layoutSettings.focusMode || !appSettings.appearance.showActivityBar,
      'status-hidden': layoutSettings.focusMode || !appSettings.appearance.showStatusBar,
      comfortable: appSettings.appearance.density === 'comfortable',
      'settings-page': showSettingsView,
    }"
    :style="shellStyle"
    data-testid="app-shell"
  >
    <nav v-if="!layoutSettings.focusMode && appSettings.appearance.showActivityBar" class="activity-bar" aria-label="Activity">
      <button
        type="button"
        class="activity-button"
        :class="{ active: layoutSettings.activeActivitySection === 'workspace' }"
        title="Workspace"
        @click="setActivitySection('workspace')"
      >
        <LayoutPanelLeft :size="18" />
      </button>
      <div class="activity-spacer" />
      <button
        type="button"
        class="activity-button"
        :class="{ active: layoutSettings.activeActivitySection === 'settings' }"
        title="Settings"
        @click="setActivitySection('settings')"
      >
        <Settings :size="18" />
      </button>
    </nav>

    <aside v-if="showSidebar" class="workspace-sidebar" :aria-label="layoutSettings.activeActivitySection === 'settings' ? 'Settings' : 'Workspace'" @click.self="clearSidebarSelection">
      <template v-if="layoutSettings.activeActivitySection === 'settings'">
        <div class="workspace-header">
          <div>
            <p class="app-kicker">Folden</p>
            <h1>Settings</h1>
          </div>
        </div>
        <nav class="settings-nav" aria-label="Settings sections">
          <button
            type="button"
            class="settings-nav-button"
            :class="{ active: activeSettingsSection === 'editor' }"
            @click="activeSettingsSection = 'editor'"
          >
            Editor
          </button>
          <button
            type="button"
            class="settings-nav-button"
            :class="{ active: activeSettingsSection === 'files' }"
            @click="activeSettingsSection = 'files'"
          >
            Files
          </button>
          <button
            type="button"
            class="settings-nav-button"
            :class="{ active: activeSettingsSection === 'appearance' }"
            @click="activeSettingsSection = 'appearance'"
          >
            Appearance
          </button>
        </nav>
      </template>

      <template v-else>
        <div class="workspace-header">
          <div>
            <p class="app-kicker">Folden</p>
            <h1>{{ workspace?.name ?? 'No workspace' }}</h1>
          </div>
          <button
            type="button"
            class="icon-button"
            title="Open folder"
            aria-label="Open folder"
            :disabled="!canExecuteCommand('workspace.open')"
            @click="executeCommand('workspace.open')"
          >
            <FolderOpen :size="17" />
          </button>
        </div>

        <div class="workspace-actions">
          <button
            type="button"
            class="icon-button"
            title="New scratch document"
            aria-label="New scratch document"
            :disabled="!canExecuteCommand('document.new')"
            @click="executeCommand('document.new')"
          >
            <FilePlus :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="New file"
            aria-label="New file"
            :disabled="!canExecuteCommand('workspace.createFile')"
            @click="executeCommand('workspace.createFile')"
          >
            <FilePlus :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="New folder"
            aria-label="New folder"
            :disabled="!canExecuteCommand('workspace.createDirectory')"
            @click="executeCommand('workspace.createDirectory')"
          >
            <FolderPlus :size="16" />
          </button>
        </div>

        <div class="workspace-sidebar-content">
          <section v-if="documents.length && !openEditorsCollapsed" class="open-editors" aria-label="Open editors">
            <button type="button" class="section-header" @click="openEditorsCollapsed = true">
              Open Editors
            </button>
            <button
              v-for="document in documents"
              :key="document.id"
              type="button"
              class="open-editor-row"
              :class="{
                active: isVisiblePaneDocument(document.id),
                'active-pane-document': isActivePaneDocument(document.id),
              }"
              :title="document.path ? cleanDisplayPath(document.path) : 'Scratch document'"
              draggable="true"
              @dragstart="startDocumentDrag($event, {
                kind: 'open-editor',
                documentId: document.id,
                paneId: getPrimaryDocumentPane(document.id)?.id ?? activePaneId,
              })"
              @click="
                setActiveDocument(
                  getPrimaryDocumentPane(document.id) ?? activePane,
                  document.id,
                )
              "
            >
              <span class="open-editor-active-marker" aria-hidden="true" />
              <span class="open-editor-name">{{ document.name }}</span>
              <span class="open-editor-pane">
                {{ getDocumentPaneLabel(document.id) }}
              </span>
              <span v-if="isDirty(document)" class="tab-dot" />
            </button>
          </section>
          <button v-else-if="documents.length" type="button" class="section-header" @click="openEditorsCollapsed = false">
            Open Editors
          </button>

          <div v-if="workspace" class="workspace-root" :title="workspace.rootPath" data-testid="workspace-root">
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
              :expanded-paths="expandedWorkspacePaths"
              :loading-paths="loadingWorkspacePaths"
              :load-errors="workspaceLoadErrors"
              @clear-selection="clearSidebarSelection"
              @open-file="openWorkspaceFile"
              @select-path="setSelectedPath($event.path)"
              @create-file="createWorkspaceFile($event.path)"
              @create-directory="createWorkspaceDirectory($event.path)"
              @rename-path="renameWorkspacePath"
              @trash-path="trashWorkspacePath"
              @toggle-directory="toggleWorkspaceDirectory"
            />
          </div>

          <section v-else class="empty-sidebar">
            <p>Open a folder to start a workspace.</p>
            <button
              type="button"
              :disabled="!canExecuteCommand('workspace.open')"
              data-testid="open-folder-empty"
              @click="executeCommand('workspace.open')"
            >
              Open Folder
            </button>

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
        </div>
      </template>
    </aside>

    <div
      v-if="showSidebar"
      class="sidebar-splitter"
      role="separator"
      aria-label="Resize sidebar"
      @mousedown="beginSidebarResize"
      @dblclick="resetLayoutSettings"
    />

    <section class="workbench" :class="{ 'settings-page': showSettingsView }">
      <header v-if="showEditorView" class="topbar">
        <div class="topbar-title">
          <span class="document-title" data-testid="document-title">{{ activeDocument?.name ?? 'No document' }}</span>
          <div
            v-if="layoutSettings.activeActivitySection !== 'settings' || layoutSettings.focusMode"
            class="mode-switch topbar-mode-switch"
            aria-label="Editor mode"
          >
            <button
              type="button"
              class="icon-button labelled-icon-button"
              title="Visual"
              aria-label="Visual"
              :class="{ active: activeDocument && activeDocumentMode === 'visual' }"
              :disabled="!activeDocument || !isMarkdownPath(activeDocument.path)"
              @click="activePane && activeDocument && setPaneDocumentMode(activePane, activeDocument, 'visual')"
            >
              <Eye :size="16" />
              <span>Visual</span>
            </button>
            <button
              type="button"
              class="icon-button labelled-icon-button"
              title="Source"
              aria-label="Source"
              :class="{ active: activeDocument && activeDocumentMode === 'source' }"
              :disabled="!activeDocument"
              @click="activePane && activeDocument && setPaneDocumentMode(activePane, activeDocument, 'source')"
            >
              <FileCode2 :size="16" />
              <span>Source</span>
            </button>
          </div>
          <span v-if="dirtyDocuments.length" class="dirty-marker" data-testid="dirty-marker">
            {{ dirtyDocuments.length }} unsaved
          </span>
        </div>

        <div class="topbar-actions">
          <button
            v-if="
              activePaneDocument
              && documentHasRemoteImages(activePaneDocument)
              && !shouldLoadRemoteImages(activePaneDocument)
            "
            type="button"
            class="load-remote-images-button"
            data-testid="load-remote-images"
            @click="allowRemoteImagesForDocument(activePaneDocument)"
          >
            Load remote images
          </button>
          <button
            type="button"
            class="icon-button"
            title="Open file"
            aria-label="Open file"
            :disabled="!canExecuteCommand('document.open')"
            @click="executeCommand('document.open')"
          >
            <FolderOpen :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Save"
            aria-label="Save"
            data-testid="save-document"
            :disabled="!canExecuteCommand('document.save')"
            @click="executeCommand('document.save')"
          >
            <Save :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Focus mode"
            aria-label="Focus mode"
            :class="{ active: layoutSettings.focusMode }"
            @click="toggleFocusMode"
          >
            <Wrench :size="16" />
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            title="Toggle split view"
            aria-label="Toggle split view"
            :class="{ active: splitEnabled }"
            :disabled="!canExecuteCommand('layout.toggleSplit')"
            @click="executeCommand('layout.toggleSplit')"
          >
            <Columns2 :size="16" />
            <span>Split</span>
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            :title="moveActiveTabTitle"
            :aria-label="moveActiveTabTitle"
            :disabled="!canExecuteCommand('layout.moveViewRight')"
            @click="executeCommand('layout.moveViewRight')"
          >
            <component :is="moveActiveTabIcon" :size="16" />
            <span>{{ activePaneIsRight ? 'Move left' : 'Move right' }}</span>
          </button>
        </div>
      </header>

      <section
        v-if="layoutSettings.activeActivitySection === 'settings' && !layoutSettings.focusMode"
        class="settings-view"
        aria-label="Settings"
      >
        <div class="settings-panel">
          <header class="settings-panel-header">
            <p class="app-kicker">Settings</p>
            <h2>
              {{
                activeSettingsSection === 'editor'
                  ? 'Editor'
                  : activeSettingsSection === 'files'
                    ? 'Files'
                    : 'Appearance'
              }}
            </h2>
          </header>
          <section v-if="activeSettingsSection === 'editor'" class="settings-section">
            <label class="settings-row">
              <span>
                <strong>Source font</strong>
                <small>Font stack for plain text editing.</small>
              </span>
              <input v-model="appSettings.editor.sourceFontFamily" type="text">
            </label>
            <label class="settings-row">
              <span>
                <strong>Source size</strong>
                <small>Text size in Source mode.</small>
              </span>
              <input :value="sourceFontSizeInput" type="number" min="10" max="28" @input="sourceFontSizeInput = inputText($event)" @change="updateSourceFontSize" @blur="updateSourceFontSize">
            </label>
            <label class="settings-row">
              <span>
                <strong>Visual size</strong>
                <small>Text size in Visual mode.</small>
              </span>
              <input :value="visualFontSizeInput" type="number" min="12" max="30" @input="visualFontSizeInput = inputText($event)" @change="updateVisualFontSize" @blur="updateVisualFontSize">
            </label>
            <label class="settings-row">
              <span>
                <strong>Line height</strong>
                <small>Shared editor line spacing.</small>
              </span>
              <input :value="lineHeightInput" type="number" min="1.2" max="2.2" step="0.05" @input="lineHeightInput = inputText($event)" @change="updateLineHeight" @blur="updateLineHeight">
            </label>
            <label class="settings-row">
              <span>
                <strong>Visual width</strong>
                <small>Maximum readable content width.</small>
              </span>
              <input :value="visualMaxWidthInput" type="number" min="520" max="1120" @input="visualMaxWidthInput = inputText($event)" @change="updateVisualMaxWidth" @blur="updateVisualMaxWidth">
            </label>
            <label class="settings-row settings-toggle-row">
              <span>
                <strong>Word wrap</strong>
                <small>Wrap long lines in Source mode.</small>
              </span>
              <input v-model="appSettings.editor.wordWrap" class="settings-switch" type="checkbox">
            </label>
            <label class="settings-row">
              <span>
                <strong>Markdown opens as</strong>
                <small>Default mode for Markdown files.</small>
              </span>
              <select v-model="appSettings.editor.defaultMarkdownMode">
                <option value="visual">Visual</option>
                <option value="source">Source</option>
              </select>
            </label>
          </section>
          <section v-else-if="activeSettingsSection === 'files'" class="settings-section">
            <label class="settings-row settings-toggle-row">
              <span>
                <strong>Autosave</strong>
                <small>Save changed existing files after a short pause.</small>
              </span>
              <input v-model="appSettings.autosave.enabled" class="settings-switch" type="checkbox">
            </label>
            <label class="settings-row">
              <span>
                <strong>Autosave delay</strong>
                <small>Delay before autosave starts, in seconds.</small>
              </span>
              <input :value="autosaveDelaySecondsInput" type="number" min="0.25" max="30" step="0.25" @input="autosaveDelaySecondsInput = inputText($event)" @change="updateAutosaveDebounce" @blur="updateAutosaveDebounce">
            </label>
            <label class="settings-row settings-toggle-row">
              <span>
                <strong>Save on focus loss</strong>
                <small>Autosave changed existing files when Folden loses focus.</small>
              </span>
              <input v-model="appSettings.autosave.saveOnWindowBlur" class="settings-switch" type="checkbox">
            </label>
            <label class="settings-row settings-toggle-row">
              <span>
                <strong>Save before switching files</strong>
                <small>Autosave the current file before another document becomes active.</small>
              </span>
              <input v-model="appSettings.autosave.saveOnDocumentSwitch" class="settings-switch" type="checkbox">
            </label>
          </section>
          <section v-else class="settings-section">
            <label class="settings-row">
              <span>
                <strong>UI scale</strong>
                <small>Scale controls and application chrome.</small>
              </span>
              <input :value="uiScaleInput" type="number" min="0.85" max="1.25" step="0.05" @input="uiScaleInput = inputText($event)" @change="updateUiScale" @blur="updateUiScale">
            </label>
            <label class="settings-row">
              <span>
                <strong>Density</strong>
                <small>Spacing preset for controls.</small>
              </span>
              <select v-model="appSettings.appearance.density">
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
            <label class="settings-row settings-toggle-row">
              <span>
                <strong>Status bar</strong>
                <small>Show document stats at the bottom.</small>
              </span>
              <input v-model="appSettings.appearance.showStatusBar" class="settings-switch" type="checkbox">
            </label>
            <label class="settings-row settings-toggle-row">
              <span>
                <strong>Sidebar</strong>
                <small>Show workspace sidebar outside Settings.</small>
              </span>
              <input v-model="appSettings.appearance.showSidebar" class="settings-switch" type="checkbox">
            </label>
            <div class="settings-actions">
              <button type="button" @click="resetLayoutSettings">
                Reset layout
              </button>
              <button
                type="button"
                :disabled="!canExecuteCommand('diagnostics.export')"
                data-testid="export-diagnostics"
                @click="executeCommand('diagnostics.export')"
              >
                Export diagnostics
              </button>
            </div>
          </section>
        </div>
      </section>

      <div
        v-if="errorMessage || watcherWarning"
        class="toast-stack"
        aria-live="polite"
      >
        <p :class="errorMessage ? 'toast-message error-message' : 'toast-message warning-message'">
          {{ errorMessage ?? watcherWarning }}
        </p>
      </div>
      <section
        v-if="showEditorView && activeDocument?.externalState === 'conflict'"
        class="document-warning"
        data-testid="conflict-warning"
      >
        <div>
          <strong>External changes detected.</strong>
          <span>{{ activeDocument.externalMessage ?? 'Compare Folden and disk versions before continuing.' }}</span>
        </div>
        <div class="document-warning-actions">
          <button
            type="button"
            data-testid="resolve-conflict"
            @click="runFileTask(() => openConflictResolution(activeDocument!.id), 'Could not open conflict comparison')"
          >
            Resolve conflict
          </button>
          <button type="button" @click="saveDocumentAsCopy(activeDocument!)">
            Save As
          </button>
          <button type="button" @click="clearDocumentExternalState(activeDocument!.id)">
            Later
          </button>
        </div>
      </section>
      <section
        v-else-if="showEditorView && activeDocument?.externalState === 'missing'"
        class="document-warning"
      >
        <div>
          <strong>File is missing on disk.</strong>
          <span>{{ activeDocument.externalMessage }}</span>
        </div>
        <div class="document-warning-actions">
          <button type="button" @click="saveDocumentAsCopy(activeDocument)">
            Save As
          </button>
          <button type="button" @click="reloadDocumentFromDisk(activeDocument.id)">
            Retry reload
          </button>
        </div>
      </section>

      <section v-if="showDocumentToolbar" class="shared-toolbar" aria-label="Document toolbar">
        <div class="format-toolbar shared-format-toolbar">
          <button
            v-for="item in visualToolbarCommands"
            :key="item.command"
            type="button"
            class="toolbar-button"
            :title="item.title"
            :aria-label="item.title"
            @click="runActiveVisualCommand(item.command)"
          >
            <component :is="item.icon" v-if="item.icon" :size="16" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </section>

      <section
        v-if="layoutSettings.activeActivitySection !== 'settings' || layoutSettings.focusMode"
        class="pane-grid"
        :class="{ split: splitEnabled }"
      >
        <section
          v-for="pane in visiblePanes"
          :key="pane.id"
          class="editor-pane"
          :data-pane-id="pane.id"
          :class="{ active: activePaneId === pane.id }"
          @click="setActivePane(pane.id)"
          @dragover.prevent="handleDocumentDragOver"
          @drop="handlePaneDrop($event, pane.id)"
        >
          <header class="pane-header">
            <div
              class="pane-tabs"
              @dragover.prevent.stop="handleDocumentDragOver"
              @drop.stop="handleTabListDrop($event, pane.id)"
            >
              <button
                v-for="(documentId, index) in pane.documentIds"
                :key="documentId"
                type="button"
                class="tab-button"
                :data-tab-drop-pane="pane.id"
                :data-tab-drop-index="index"
                :class="{ active: pane.activeDocumentId === documentId }"
                :title="getDocument(documentId)?.path ? cleanDisplayPath(getDocument(documentId)!.path!) : 'Scratch document'"
                @dragover.prevent.stop="handleDocumentDragOver"
                @drop.stop="handleTabDrop($event, pane.id, index)"
                @pointerdown="beginTabPointerDrag($event, documentId, pane.id)"
                @pointermove="handleTabPointerMove"
                @pointerup="finishTabPointerDrag"
                @pointercancel="tabPointerDrag = null"
                @auxclick.stop="closeTabOnAuxClick($event, pane, documentId)"
                @click.stop="handleTabClick(pane, documentId)"
              >
                <span>{{ getDocument(documentId)?.name ?? 'Missing' }}</span>
                <span v-if="getDocument(documentId) && isDirty(getDocument(documentId)!)" class="tab-dot" />
                <X
                  class="tab-close"
                  :size="13"
                  @pointerdown.stop
                  @click.stop="closeDocument(pane, documentId)"
                />
              </button>
              <span
                class="tab-drop-tail"
                :data-tab-drop-pane="pane.id"
                :data-tab-drop-index="pane.documentIds.length"
                @dragover.prevent.stop="handleDocumentDragOver"
                @drop.stop="handleTabDrop($event, pane.id, pane.documentIds.length)"
              />
            </div>
          </header>

          <template v-if="pane.activeDocumentId && getDocument(pane.activeDocumentId)">
            <VisualMarkdownEditor
              v-if="getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual'"
              :key="`${getViewSessionId(pane, getDocument(pane.activeDocumentId)!)}:${shouldLoadRemoteImages(getDocument(pane.activeDocumentId)! ) ? 'remote-on' : 'remote-off'}`"
              :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
              :document-id="getDocument(pane.activeDocumentId)!.id"
              :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
              :model-value="getDocument(pane.activeDocumentId)!.content"
              :revision="getDocument(pane.activeDocumentId)!.revision"
              :document-path="getDocument(pane.activeDocumentId)!.path"
              :workspace-root-path="workspace?.rootPath ?? null"
              :allow-remote-images="shouldLoadRemoteImages(getDocument(pane.activeDocumentId)!)"
              @document-update="handleDocumentUpdate"
            />
            <section v-else class="source-editor-frame">
              <SourceEditor
                :key="`${getViewSessionId(pane, getDocument(pane.activeDocumentId)!)}:${appSettings.editor.wordWrap ? 'wrap' : 'nowrap'}`"
                :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
                :document-id="getDocument(pane.activeDocumentId)!.id"
                :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
                :model-value="getDocument(pane.activeDocumentId)!.content"
                :revision="getDocument(pane.activeDocumentId)!.revision"
                :word-wrap="appSettings.editor.wordWrap"
                @document-update="handleDocumentUpdate"
              />
            </section>
          </template>

          <div v-else class="empty-pane">
            <p>No open file in this pane.</p>
          </div>
        </section>
        <div
          v-if="splitEnabled"
          class="pane-splitter"
          role="separator"
          aria-label="Resize editor panes"
          @mousedown="beginSplitResize"
          @dblclick="resetLayoutSettings"
        />
      </section>

      <footer v-if="showEditorView && appSettings.appearance.showStatusBar && !layoutSettings.focusMode" class="statusbar">
        <span>{{ documents.length }} open</span>
        <span
          class="path-status"
          :title="activeDocument?.path ? cleanDisplayPath(activeDocument.path) : 'Scratch document'"
          data-testid="status-path"
        >
          {{ activeLocation }}
        </span>
        <span>{{ activeDocument ? `${activeDocument.content.length} chars` : 'No document' }}</span>
        <span v-if="activeDocument">{{ activeDocumentWordCount }} words</span>
        <span v-if="activeDocumentMode">{{ activeDocumentMode }}</span>
      </footer>
    </section>
  </main>

  <PromptDialog
    :open="!!promptDialog"
    :title="promptDialog?.title ?? ''"
    :message="promptDialog?.message ?? ''"
    :initial-value="promptDialog?.initialValue ?? ''"
    :placeholder="promptDialog?.placeholder ?? ''"
    :confirm-label="promptDialog?.confirmLabel ?? 'Save'"
    :input-label="promptDialog?.inputLabel ?? 'Value'"
    :error="promptDialogError"
    @submit="submitPromptDialog"
    @cancel="cancelPromptDialog"
  />

  <ConfirmDialog
    :open="!!confirmDialog"
    :title="confirmDialog?.title ?? ''"
    :message="confirmDialog?.message ?? ''"
    :confirm-label="confirmDialog?.confirmLabel ?? 'Confirm'"
    :cancel-label="confirmDialog?.cancelLabel ?? 'Cancel'"
    :confirm-tone="confirmDialog?.confirmTone ?? 'default'"
    @confirm="resolveConfirmDialog(true)"
    @cancel="resolveConfirmDialog(false)"
  />

  <MarkdownSafetyDialog
    :open="!!markdownSafetyDialog"
    :title="markdownSafetyDialog?.title ?? ''"
    :features="markdownSafetyDialog?.features ?? []"
    @confirm="resolveMarkdownSafetyDialog(true)"
    @cancel="resolveMarkdownSafetyDialog(false)"
  />

  <UnsavedChangesDialog
    :open="!!unsavedDialog"
    :title="unsavedDialog?.title ?? ''"
    :message="unsavedDialog?.message ?? ''"
    :save-label="unsavedDialog?.saveLabel ?? 'Save'"
    :discard-label="unsavedDialog?.discardLabel ?? 'Discard'"
    :cancel-label="unsavedDialog?.cancelLabel ?? 'Cancel'"
    :show-save="unsavedDialog?.showSave ?? true"
    @save="resolveUnsavedDialog('save')"
    @discard="resolveUnsavedDialog('discard')"
    @cancel="resolveUnsavedDialog('cancel')"
  />

  <RecoveryDialog
    :open="!!recoveryDialog"
    :title="recoveryDialog?.title ?? ''"
    :message="recoveryDialog?.message ?? ''"
    :details="recoveryDialog?.details ?? null"
    @restore="resolveRecoveryDialog('restore')"
    @open-copy="resolveRecoveryDialog('open-copy')"
    @discard="resolveRecoveryDialog('discard')"
    @later="resolveRecoveryDialog('later')"
  />

  <ConflictResolutionDialog
    :open="!!conflictDialog"
    :title="conflictDialog?.title ?? ''"
    :path="conflictDialog?.path ?? null"
    :folden-content="conflictDialog?.foldenContent ?? ''"
    :disk-content="conflictDialog?.diskContent ?? ''"
    @keep-folden="resolveConflictDialog({ kind: 'keep-folden' })"
    @reload-disk="resolveConflictDialog({ kind: 'reload-disk' })"
    @save-as="resolveConflictDialog({ kind: 'save-as' })"
    @apply-merged="resolveConflictDialog({ kind: 'apply-merged', content: $event })"
    @later="resolveConflictDialog({ kind: 'later' })"
  />
</template>
