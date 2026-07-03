<script setup lang="ts">
import {
  Columns2,
  Eye,
  FileCode2,
  FilePenLine,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Focus,
  Image as ImageIcon,
  PanelLeftOpen,
  PanelRightOpen,
  Save,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmDialog from '../dialogs/ConfirmDialog.vue'
import ConflictResolutionDialog from '../dialogs/ConflictResolutionDialog.vue'
import MarkdownSafetyDialog from '../dialogs/MarkdownSafetyDialog.vue'
import PromptDialog from '../dialogs/PromptDialog.vue'
import RecoveryDialog from '../dialogs/RecoveryDialog.vue'
import UnsavedChangesDialog from '../dialogs/UnsavedChangesDialog.vue'
import ActivityRail from './ActivityRail.vue'
import DocumentToolbar from './DocumentToolbar.vue'
import EditorPaneGrid from './EditorPaneGrid.vue'
import OpenEditors from './OpenEditors.vue'
import WorkspaceTree from '../workspace/WorkspaceTree.vue'
import { useApplicationShell } from '../../applicationShell'
import {
  applicationSettingLimits,
  layoutSettingLimits,
} from '../../infrastructure/settings/settings'
import { uiIconSizes } from '../uiConstants'

const resizeKeyboardStepPx = 16
const resizeKeyboardLargeStepPx = 48
const splitKeyboardStep = 0.025
const splitKeyboardLargeStep = 0.1

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
  resetActivityRailWidth,
  runActiveVisualCommand,
  setActivitySection,
  setActivityRailMode,
  setActivityRailWidth,
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

const openEditorsCollapsed = ref(false)
const activeSettingsSection = ref<'editor' | 'files' | 'appearance'>('editor')
const appShellElement = ref<HTMLElement | null>(null)
const workspaceSidebarElement = ref<HTMLElement | null>(null)
const sidebarResizeStart = ref<{ x: number, width: number } | null>(null)
const splitResizeStart = ref<{ x: number, ratio: number, width: number } | null>(null)
const sourceFontSizeInput = ref(String(appSettings.value.editor.sourceFontSize))
const visualFontSizeInput = ref(String(appSettings.value.editor.visualFontSize))
const lineHeightInput = ref(String(appSettings.value.editor.lineHeight))
const visualMaxWidthInput = ref(String(appSettings.value.editor.visualMaxWidth))
const autosaveDelaySecondsInput = ref(formatSeconds(appSettings.value.autosave.debounceMs))
const uiScaleInput = ref(String(appSettings.value.appearance.uiScale))

const activityWidth = computed(() => layoutSettings.value.activityRailMode === 'expanded'
  ? layoutSettings.value.activityExpandedWidth
  : layoutSettings.value.activityCompactWidth)

const shellStyle = computed(() => ({
  '--activity-width': `${activityWidth.value}px`,
  '--sidebar-width': `${layoutSettings.value.sidebarWidth}px`,
  '--split-left': `${layoutSettings.value.splitRatio}fr`,
  '--split-right': `${1 - layoutSettings.value.splitRatio}fr`,
  '--ui-scale': String(clampNumber(appSettings.value.appearance.uiScale, applicationSettingLimits.uiScale)),
  '--source-font-family': appSettings.value.editor.sourceFontFamily,
  '--source-font-size': `${clampNumber(appSettings.value.editor.sourceFontSize, applicationSettingLimits.sourceFontSize)}px`,
  '--editor-line-height': String(clampNumber(appSettings.value.editor.lineHeight, applicationSettingLimits.lineHeight)),
  '--visual-font-size': `${clampNumber(appSettings.value.editor.visualFontSize, applicationSettingLimits.visualFontSize)}px`,
  '--visual-max-width': `${clampNumber(appSettings.value.editor.visualMaxWidth, applicationSettingLimits.visualMaxWidth)}px`,
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
const moveActiveTabIcon = computed(() => activePaneIsRight.value ? PanelRightOpen : PanelLeftOpen)
const showDocumentToolbar = computed(() =>
  (layoutSettings.value.activeActivitySection !== 'settings' || layoutSettings.value.focusMode)
  && activeDocumentMode.value === 'visual'
  && activeDocument.value !== null,
)
const showSettingsView = computed(() =>
  layoutSettings.value.activeActivitySection === 'settings' && !layoutSettings.value.focusMode,
)
const showEditorView = computed(() => !showSettingsView.value)

function closeOpenDisclosureMenus(target: EventTarget | null) {
  document.querySelectorAll<HTMLDetailsElement>('details[data-close-on-outside][open]').forEach((menu) => {
    if (target instanceof Node && menu.contains(target)) {
      return
    }

    menu.removeAttribute('open')
  })
}

function handleGlobalPointerDown(event: PointerEvent) {
  closeOpenDisclosureMenus(event.target)
}

function handleGlobalKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeOpenDisclosureMenus(null)
  }
}

function clampNumber(value: unknown, limit: { min: number, max: number, fallback: number }) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, limit.min), limit.max)
    : limit.fallback
}

function inputText(event: Event) {
  return (event.target as HTMLInputElement).value
}

function formatSeconds(milliseconds: number) {
  return String(milliseconds / 1000)
}

function secondsLimit(millisecondsLimit: { min: number, max: number, fallback: number, step: number }) {
  return {
    min: millisecondsLimit.min / 1000,
    max: millisecondsLimit.max / 1000,
    fallback: millisecondsLimit.fallback / 1000,
    step: millisecondsLimit.step / 1000,
  }
}

const autosaveDelaySecondsLimit = secondsLimit(applicationSettingLimits.autosaveDebounceMs)

function formatOpenDocumentsStatus(openCount: number, unsavedCount: number) {
  return unsavedCount > 0
    ? `${openCount} open · ${unsavedCount} unsaved`
    : `${openCount} open`
}

function applyNumberInput(value: string, limit: { min: number, max: number, fallback: number }) {
  const numberValue = Number(value)
  return clampNumber(Number.isFinite(numberValue) ? numberValue : limit.fallback, limit)
}

function updateSourceFontSize() {
  appSettings.value.editor.sourceFontSize = applyNumberInput(sourceFontSizeInput.value, applicationSettingLimits.sourceFontSize)
  sourceFontSizeInput.value = String(appSettings.value.editor.sourceFontSize)
}

function updateVisualFontSize() {
  appSettings.value.editor.visualFontSize = applyNumberInput(visualFontSizeInput.value, applicationSettingLimits.visualFontSize)
  visualFontSizeInput.value = String(appSettings.value.editor.visualFontSize)
}

function updateLineHeight() {
  appSettings.value.editor.lineHeight = applyNumberInput(lineHeightInput.value, applicationSettingLimits.lineHeight)
  lineHeightInput.value = String(appSettings.value.editor.lineHeight)
}

function updateVisualMaxWidth() {
  appSettings.value.editor.visualMaxWidth = applyNumberInput(visualMaxWidthInput.value, applicationSettingLimits.visualMaxWidth)
  visualMaxWidthInput.value = String(appSettings.value.editor.visualMaxWidth)
}

function updateAutosaveDebounce() {
  const seconds = applyNumberInput(autosaveDelaySecondsInput.value, autosaveDelaySecondsLimit)
  appSettings.value.autosave.debounceMs = Math.round(seconds * 1000)
  autosaveDelaySecondsInput.value = formatSeconds(appSettings.value.autosave.debounceMs)
}

function updateUiScale() {
  appSettings.value.appearance.uiScale = applyNumberInput(uiScaleInput.value, applicationSettingLimits.uiScale)
  uiScaleInput.value = String(appSettings.value.appearance.uiScale)
}

function beginSidebarResize(event: MouseEvent) {
  sidebarResizeStart.value = {
    x: event.clientX,
    width: layoutSettings.value.sidebarWidth,
  }
  window.addEventListener('mousemove', resizeSidebar)
  window.addEventListener('mouseup', stopSidebarResize)
}

function resizeSidebar(event: MouseEvent) {
  if (sidebarResizeStart.value) {
    setSidebarWidth(sidebarResizeStart.value.width + event.clientX - sidebarResizeStart.value.x)
  }
}

function stopSidebarResize() {
  sidebarResizeStart.value = null
  window.removeEventListener('mousemove', resizeSidebar)
  window.removeEventListener('mouseup', stopSidebarResize)
}

function resizeSidebarWithKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const step = event.shiftKey ? resizeKeyboardLargeStepPx : resizeKeyboardStepPx
  setSidebarWidth(layoutSettings.value.sidebarWidth + direction * step)
}

function beginSplitResize(event: MouseEvent) {
  const parent = (event.currentTarget as HTMLElement).parentElement

  splitResizeStart.value = {
    x: event.clientX,
    ratio: layoutSettings.value.splitRatio,
    width: parent?.clientWidth ?? window.innerWidth,
  }
  window.addEventListener('mousemove', resizeSplit)
  window.addEventListener('mouseup', stopSplitResize)
}

function resizeSplit(event: MouseEvent) {
  if (splitResizeStart.value) {
    setSplitRatio(splitResizeStart.value.ratio + (event.clientX - splitResizeStart.value.x) / splitResizeStart.value.width)
  }
}

function stopSplitResize() {
  splitResizeStart.value = null
  window.removeEventListener('mousemove', resizeSplit)
  window.removeEventListener('mouseup', stopSplitResize)
}

function resizeSplitWithKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const step = event.shiftKey ? splitKeyboardLargeStep : splitKeyboardStep
  setSplitRatio(layoutSettings.value.splitRatio + direction * step)
}

let labelFitObserver: ResizeObserver | null = null
let labelFitFrame = 0
const observedFitElements = new Set<Element>()

function observeFitElement(element: Element | null | undefined) {
  if (!element || observedFitElements.has(element)) {
    return
  }

  labelFitObserver?.observe(element)
  observedFitElements.add(element)
}

function queueFitLabelUpdate() {
  if (labelFitFrame) {
    cancelAnimationFrame(labelFitFrame)
  }

  labelFitFrame = requestAnimationFrame(updateFittingLabels)
}

function updateFittingLabels() {
  labelFitFrame = 0

  observeFitElement(appShellElement.value)
  observeFitElement(workspaceSidebarElement.value)

  const buttons = appShellElement.value
    ? [...appShellElement.value.querySelectorAll<HTMLElement>('.workspace-sidebar .fit-label-button')]
    : []

  buttons.forEach((button) => {
    observeFitElement(button)
    button.classList.remove('label-hidden')
  })

  buttons.forEach((button) => {
    button.classList.toggle('label-hidden', !doesButtonLabelFit(button))
  })
}

function doesButtonLabelFit(button: HTMLElement) {
  const label = button.querySelector<HTMLElement>('span')

  if (!label) {
    return true
  }

  const style = window.getComputedStyle(button)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const gap = parseFloat(style.columnGap || style.gap || '0') || 0
  const iconWidth = [...button.children]
    .filter((child) => child !== label)
    .reduce((total, child) => total + child.getBoundingClientRect().width, 0)
  const requiredWidth = padding + iconWidth + gap + label.scrollWidth

  return requiredWidth <= button.clientWidth + 1
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
watch([
  () => layoutSettings.value.sidebarWidth,
  () => layoutSettings.value.activeActivitySection,
  showSidebar,
], () => queueFitLabelUpdate(), { flush: 'post' })

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalPointerDown)
  document.addEventListener('keydown', handleGlobalKeyDown)
  labelFitObserver = new ResizeObserver(() => queueFitLabelUpdate())
  queueFitLabelUpdate()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  document.removeEventListener('keydown', handleGlobalKeyDown)
  stopSidebarResize()
  stopSplitResize()
  if (labelFitFrame) {
    cancelAnimationFrame(labelFitFrame)
  }
  labelFitObserver?.disconnect()
  labelFitObserver = null
  observedFitElements.clear()
})
</script>

<template>
  <main
    ref="appShellElement"
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
    <ActivityRail
      v-if="!layoutSettings.focusMode && appSettings.appearance.showActivityBar"
      :active-section="layoutSettings.activeActivitySection"
      :mode="layoutSettings.activityRailMode"
      :compact-width="layoutSettings.activityCompactWidth"
      :expanded-width="layoutSettings.activityExpandedWidth"
      :can-create-document="canExecuteCommand('document.new')"
      @set-section="setActivitySection"
      @set-mode="setActivityRailMode"
      @set-width="setActivityRailWidth"
      @reset-width="resetActivityRailWidth"
      @create-document="executeCommand('document.new')"
    />

    <aside
      v-if="showSidebar"
      ref="workspaceSidebarElement"
      class="workspace-sidebar"
      :aria-label="layoutSettings.activeActivitySection === 'settings' ? 'Settings' : 'Workspace'"
      @click.self="clearSidebarSelection"
    >
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
          <div class="workspace-title-block">
            <p class="app-kicker">Folden</p>
            <h1>{{ workspace?.name ?? 'No workspace' }}</h1>
            <p v-if="workspace" class="workspace-root" :title="workspace.rootPath" data-testid="workspace-root">
              {{ workspace.rootPath }}
            </p>
          </div>
          <button
            type="button"
            class="icon-button labelled-icon-button fit-label-button"
            title="Open folder"
            aria-label="Open folder"
            :disabled="!canExecuteCommand('workspace.open')"
            @click="executeCommand('workspace.open')"
          >
            <FolderOpen :size="17" />
            <span>Open workspace</span>
          </button>
        </div>

        <div class="workspace-sidebar-content">
          <OpenEditors
            v-model:collapsed="openEditorsCollapsed"
            :documents="documents"
            :visible-panes="visiblePanes"
            :active-pane="activePane"
            :active-pane-id="activePaneId"
            :clean-display-path="cleanDisplayPath"
            :is-dirty="isDirty"
            @select-document="(pane, documentId) => setActiveDocument(pane, documentId)"
          />

          <div
            v-if="workspace"
            class="workspace-tree-shell"
            @click.self="clearSidebarSelection"
          >
            <div class="workspace-tree-actions" aria-label="Workspace file actions">
              <button
                type="button"
                class="icon-button labelled-icon-button fit-label-button"
                title="New scratch document"
                aria-label="New scratch document"
                :disabled="!canExecuteCommand('document.new')"
                @click="executeCommand('document.new')"
              >
                <FilePenLine :size="uiIconSizes.workspaceAction" />
                <span>New scratch</span>
              </button>
              <button
                type="button"
                class="icon-button labelled-icon-button fit-label-button"
                title="New file"
                aria-label="New file"
                :disabled="!canExecuteCommand('workspace.createFile')"
                @click="executeCommand('workspace.createFile')"
              >
                <FilePlus :size="uiIconSizes.workspaceAction" />
                <span>New file</span>
              </button>
              <button
                type="button"
                class="icon-button labelled-icon-button fit-label-button"
                title="New folder"
                aria-label="New folder"
                :disabled="!canExecuteCommand('workspace.createDirectory')"
                @click="executeCommand('workspace.createDirectory')"
              >
                <FolderPlus :size="uiIconSizes.workspaceAction" />
                <span>New folder</span>
              </button>
            </div>
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
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuemin="layoutSettingLimits.sidebarWidth.min"
      :aria-valuemax="layoutSettingLimits.sidebarWidth.max"
      :aria-valuenow="layoutSettings.sidebarWidth"
      @mousedown="beginSidebarResize"
      @keydown="resizeSidebarWithKeyboard"
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
              <Eye :size="uiIconSizes.toolbar" />
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
              <FileCode2 :size="uiIconSizes.toolbar" />
              <span>Source</span>
            </button>
          </div>
          <button
            v-if="
              activePaneDocument
              && documentHasRemoteImages(activePaneDocument)
              && !shouldLoadRemoteImages(activePaneDocument)
            "
            type="button"
            class="load-remote-images-button labelled-icon-button"
            data-testid="load-remote-images"
            @click="allowRemoteImagesForDocument(activePaneDocument)"
          >
            <ImageIcon :size="uiIconSizes.toolbar" />
            <span>Load remote images</span>
          </button>
        </div>

        <div class="topbar-actions">
          <button
            type="button"
            class="icon-button labelled-icon-button"
            title="Open file"
            aria-label="Open file"
            :disabled="!canExecuteCommand('document.open')"
            @click="executeCommand('document.open')"
          >
            <FolderOpen :size="uiIconSizes.toolbar" />
            <span>Open</span>
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            title="Save"
            aria-label="Save"
            data-testid="save-document"
            :disabled="!canExecuteCommand('document.save')"
            @click="executeCommand('document.save')"
          >
            <Save :size="uiIconSizes.toolbar" />
            <span>Save</span>
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            title="Focus mode"
            aria-label="Focus mode"
            :class="{ active: layoutSettings.focusMode }"
            @click="toggleFocusMode"
          >
            <Focus :size="uiIconSizes.toolbar" />
            <span>Focus</span>
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
            <Columns2 :size="uiIconSizes.toolbar" />
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
            <component :is="moveActiveTabIcon" :size="uiIconSizes.toolbar" />
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
              <input :value="sourceFontSizeInput" type="number" :min="applicationSettingLimits.sourceFontSize.min" :max="applicationSettingLimits.sourceFontSize.max" @input="sourceFontSizeInput = inputText($event)" @change="updateSourceFontSize" @blur="updateSourceFontSize">
            </label>
            <label class="settings-row">
              <span>
                <strong>Visual size</strong>
                <small>Text size in Visual mode.</small>
              </span>
              <input :value="visualFontSizeInput" type="number" :min="applicationSettingLimits.visualFontSize.min" :max="applicationSettingLimits.visualFontSize.max" @input="visualFontSizeInput = inputText($event)" @change="updateVisualFontSize" @blur="updateVisualFontSize">
            </label>
            <label class="settings-row">
              <span>
                <strong>Line height</strong>
                <small>Shared editor line spacing.</small>
              </span>
              <input :value="lineHeightInput" type="number" :min="applicationSettingLimits.lineHeight.min" :max="applicationSettingLimits.lineHeight.max" :step="applicationSettingLimits.lineHeight.step" @input="lineHeightInput = inputText($event)" @change="updateLineHeight" @blur="updateLineHeight">
            </label>
            <label class="settings-row">
              <span>
                <strong>Visual width</strong>
                <small>Maximum readable content width.</small>
              </span>
              <input :value="visualMaxWidthInput" type="number" :min="applicationSettingLimits.visualMaxWidth.min" :max="applicationSettingLimits.visualMaxWidth.max" @input="visualMaxWidthInput = inputText($event)" @change="updateVisualMaxWidth" @blur="updateVisualMaxWidth">
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
              <input :value="autosaveDelaySecondsInput" type="number" :min="autosaveDelaySecondsLimit.min" :max="autosaveDelaySecondsLimit.max" :step="autosaveDelaySecondsLimit.step" @input="autosaveDelaySecondsInput = inputText($event)" @change="updateAutosaveDebounce" @blur="updateAutosaveDebounce">
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
              <input :value="uiScaleInput" type="number" :min="applicationSettingLimits.uiScale.min" :max="applicationSettingLimits.uiScale.max" :step="applicationSettingLimits.uiScale.step" @input="uiScaleInput = inputText($event)" @change="updateUiScale" @blur="updateUiScale">
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

      <DocumentToolbar
        v-if="showDocumentToolbar"
        @run-command="runActiveVisualCommand"
      />

      <EditorPaneGrid
        v-if="layoutSettings.activeActivitySection !== 'settings' || layoutSettings.focusMode"
        :visible-panes="visiblePanes"
        :active-pane-id="activePaneId"
        :split-enabled="splitEnabled"
        :split-ratio="layoutSettings.splitRatio"
        :app-settings="appSettings"
        :workspace-root-path="workspace?.rootPath ?? null"
        :clean-display-path="cleanDisplayPath"
        :close-document="closeDocument"
        :get-document="getDocument"
        :get-document-mode="getDocumentMode"
        :get-view-session-id="getViewSessionId"
        :is-dirty="isDirty"
        :open-dropped-path="openDroppedPath"
        :set-active-document="setActiveDocument"
        :set-pane-editor-adapter="setPaneEditorAdapter"
        :should-load-remote-images="shouldLoadRemoteImages"
        @begin-split-resize="beginSplitResize"
        @keyboard-split-resize="resizeSplitWithKeyboard"
        @document-update="handleDocumentUpdate"
        @move-document-between-panes="moveDocumentIdBetweenPanes"
        @reorder-document-in-pane="reorderDocumentInPane"
        @reset-layout="resetLayoutSettings"
        @set-active-pane="setActivePane"
      />

      <footer v-if="showEditorView && appSettings.appearance.showStatusBar && !layoutSettings.focusMode" class="statusbar">
        <span data-testid="open-documents-status">{{ formatOpenDocumentsStatus(documents.length, dirtyDocuments.length) }}</span>
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
