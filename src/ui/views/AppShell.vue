<script setup lang="ts">
import {
  Columns2,
  Search,
  Printer,
  ArrowLeft,
  ArrowRight,
  Eye,
  FileCode2,
  FilePenLine,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Focus,
  Image as ImageIcon,
  ListTree,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Save,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmDialog from '../dialogs/ConfirmDialog.vue'
import AboutDialog from '../dialogs/AboutDialog.vue'
import ConflictResolutionDialog from '../dialogs/ConflictResolutionDialog.vue'
import MarkdownSafetyDialog from '../dialogs/MarkdownSafetyDialog.vue'
import PromptDialog from '../dialogs/PromptDialog.vue'
import RecoveryDialog from '../dialogs/RecoveryDialog.vue'
import UnsavedChangesDialog from '../dialogs/UnsavedChangesDialog.vue'
import ActivityRail from './ActivityRail.vue'
import DocumentToolbar from './DocumentToolbar.vue'
import EditorPaneGrid from './EditorPaneGrid.vue'
import OpenEditors from './OpenEditors.vue'
import SettingsView from './SettingsView.vue'
import WorkspaceTree from '../workspace/WorkspaceTree.vue'
import { useApplicationShell } from '../../application/applicationShell'
import { t } from '../../application/i18n'
import FindPanel from './FindPanel.vue'
import SearchSidebar from './SearchSidebar.vue'
import QuickOpenDialog from '../dialogs/QuickOpenDialog.vue'
import PrintView from './PrintView.vue'
import type { EditorCommand } from '../../application/types/shell'
import { buildDocumentDisplayLabels } from '../../domain/documents/documentLabels'
import { applicationSettingLimits, layoutSettingLimits } from '../../application/settings'
import type { ApplicationSettings } from '../../application/settings'
import type { ActivitySection } from '../../application/settings'
import { uiIconSizes } from '../uiConstants'
import { vFitLabel } from '../fitLabel'
import {
  adaptiveEditorLayoutBreakpoints,
  editorInlinePaddingForWidth,
  resolveAdaptiveEditorLayout,
} from './adaptiveEditorLayout'

const resizeKeyboardStepPx = 16
const resizeKeyboardLargeStepPx = 48
const splitKeyboardStep = 0.025
const splitKeyboardLargeStep = 0.1
const macShortcuts = /Mac/i.test(navigator.platform)
const primaryModifier = macShortcuts ? '⌘' : 'Ctrl'
const alternateModifier = macShortcuts ? '⌥' : 'Alt'

const {
  aboutOpen,
  projectSearch,
  findOpen,
  findReplace,
  findQuery,
  findReplacement,
  findCase,
  findCount,
  findIndex,
  nextFind,
  replaceFind,
  printSnapshot,
  printPending,
  preparePrint,
  createFromTemplate,
  importImage,
  navigateLink,
  navigateHistory,
  navigationHistory,
  navigationIndex,
  moveWorkspacePath,
  activeDocument,
  activeDocumentMode,
  activeDocumentWordCount,
  analysisWarning,
  activeLocation,
  activePaneId,
  activePath,
  appSettings,
  layoutSettings,
  cleanDisplayPath,
  closeDocument,
  canExecuteCommand,
  closeSidebar,
  clearDocumentExternalState,
  clearSidebarSelection,
  confirmDialog,
  conflictDialog,
  createWorkspaceDirectory,
  createWorkspaceFile,
  dirtyDocuments,
  documents,
  documentAnalyses,
  errorMessage,
  executeCommand,
  expandedWorkspacePaths,
  getDocument,
  getDocumentMode,
  getViewSession,
  getViewSessionId,
  handleDocumentUpdate,
  isDirty,
  isMarkdownDocument,
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
  hideWorkspacePath,
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
  runActiveEditorCommand,
  setActivitySection,
  setActivityRailMode,
  setActivityRailWidth,
  setSidebarWidth,
  setSplitRatio,
  setOutlineWidth,
  setDocumentMapWidth,
  shouldLoadRemoteImages,
  submitPromptDialog,
  cancelPromptDialog,
  toggleDocumentOutline,
  toggleDocumentMap,
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

function closePrint() {
  printSnapshot.value = null
  printPending.value = false
}

const welcomeDismissed = ref(false)
const showWelcome = computed(
  () =>
    !welcomeDismissed.value &&
    !workspace.value &&
    documents.value.length === 1 &&
    !activeDocument.value?.content &&
    !activeDocument.value?.path,
)
const {
  query: workspaceQuery,
  matchCase: workspaceCase,
  results: workspaceResults,
  busy: searchBusy,
  partial: searchPartial,
  skipped: searchSkipped,
  error: searchError,
  quickOpen,
  quickQuery,
  quickResults,
  quickBusy,
  quickError,
  quickPartial,
} = projectSearch

type ActivityScreen = {
  sidebar: 'workspace' | 'search' | 'create' | 'settings'
  workbench: 'editor' | 'settings'
  sidebarClosable: boolean
}

const activityScreens: Record<ActivitySection, ActivityScreen> = {
  workspace: { sidebar: 'workspace', workbench: 'editor', sidebarClosable: true },
  search: { sidebar: 'search', workbench: 'editor', sidebarClosable: true },
  create: { sidebar: 'create', workbench: 'editor', sidebarClosable: true },
  settings: { sidebar: 'settings', workbench: 'settings', sidebarClosable: false },
}

const openEditorsCollapsed = ref(false)
const activeSettingsSection = ref<'editor' | 'files' | 'appearance'>('editor')
const paneToolbarDisabledCommands = ref<Partial<Record<'left' | 'right', EditorCommand[]>>>({})
const sidebarResizeStart = ref<{ x: number; width: number } | null>(null)
const splitResizeStart = ref<{ x: number; ratio: number; width: number } | null>(null)
const shellElement = ref<HTMLElement | null>(null)
const shellWidth = ref(Number.POSITIVE_INFINITY)
const preserveAdaptiveSidebar = ref(false)
let shellResizeObserver: ResizeObserver | null = null

const activityWidth = computed(() =>
  layoutSettings.value.activityRailMode === 'expanded'
    ? layoutSettings.value.activityExpandedWidth
    : layoutSettings.value.activityCompactWidth,
)
const editorInlinePadding = computed(() => editorInlinePaddingForWidth(shellWidth.value))

const shellStyle = computed(() => ({
  '--activity-width': `${activityWidth.value}px`,
  '--sidebar-width': `${layoutSettings.value.sidebarWidth}px`,
  '--split-left': `${layoutSettings.value.splitRatio}fr`,
  '--split-right': `${1 - layoutSettings.value.splitRatio}fr`,
  '--ui-scale': String(
    clampNumber(appSettings.value.appearance.uiScale, applicationSettingLimits.uiScale),
  ),
  '--source-font-family': appSettings.value.editor.sourceFontFamily,
  '--source-font-size': `${clampNumber(appSettings.value.editor.sourceFontSize, applicationSettingLimits.sourceFontSize)}px`,
  '--editor-line-height': String(
    clampNumber(appSettings.value.editor.lineHeight, applicationSettingLimits.lineHeight),
  ),
  '--visual-font-size': `${clampNumber(appSettings.value.editor.visualFontSize, applicationSettingLimits.visualFontSize)}px`,
  '--visual-max-width': `${clampNumber(appSettings.value.editor.visualMaxWidth, applicationSettingLimits.visualMaxWidth)}px`,
  '--visual-editor-inline-padding': `${editorInlinePadding.value}px`,
}))

const activeScreen = computed(() => activityScreens[layoutSettings.value.activeActivitySection])
const sidebarLabel = computed(
  () =>
    ({
      workspace: 'Workspace',
      search: 'Search',
      create: 'Create',
      settings: 'Settings',
    })[activeScreen.value.sidebar],
)
const requestedShowSidebar = computed(
  () =>
    !layoutSettings.value.focusMode &&
    (!activeScreen.value.sidebarClosable || appSettings.value.appearance.showSidebar),
)

const activePane = computed(
  () => visiblePanes.value.find((pane) => pane.id === activePaneId.value) ?? visiblePanes.value[0],
)
const activePaneDocument = computed(() =>
  activePane.value?.activeDocumentId ? getDocument(activePane.value.activeDocumentId) : null,
)
const documentLabels = computed(() => buildDocumentDisplayLabels(documents.value, cleanDisplayPath))
const editorPaneViews = computed(() =>
  visiblePanes.value.map((pane) => {
    const activeDocumentInPane = pane.activeDocumentId ? getDocument(pane.activeDocumentId) : null

    return {
      ...pane,
      tabs: pane.documentIds.flatMap((documentId) => {
        const document = getDocument(documentId)

        return document
          ? [
              {
                document,
                label: documentLabels.value[document.id]?.label ?? document.name,
                title:
                  documentLabels.value[document.id]?.title ??
                  (document.path ? cleanDisplayPath(document.path) : t('Scratch document')),
                isActive: pane.activeDocumentId === document.id,
                isDirty: isDirty(document),
              },
            ]
          : []
      }),
      activeDocument: activeDocumentInPane
        ? {
            document: activeDocumentInPane,
            mode: getDocumentMode(pane, activeDocumentInPane),
            isMarkdown: isMarkdownDocument(activeDocumentInPane),
            viewSessionId: getViewSessionId(pane, activeDocumentInPane),
            viewSession: getViewSession(pane, activeDocumentInPane),
            shouldLoadRemoteImages: shouldLoadRemoteImages(activeDocumentInPane),
            blockDocument: activeDocumentInPane.blockDocument ?? null,
          }
        : null,
    }
  }),
)
const splitStacked = computed(
  () => splitEnabled.value && shellWidth.value <= adaptiveEditorLayoutBreakpoints.stackedSplit,
)
const adaptivePanes = computed(() =>
  editorPaneViews.value.flatMap((pane, index) => {
    const activeDocument = pane.activeDocument
    if (!activeDocument) return []
    const blocks = activeDocument.blockDocument?.blocks ?? []
    const fraction =
      splitEnabled.value && !splitStacked.value && editorPaneViews.value.length > 1
        ? index === 0
          ? layoutSettings.value.splitRatio
          : 1 - layoutSettings.value.splitRatio
        : 1

    return [
      {
        fraction,
        hasOutline: activeDocument.isMarkdown && blocks.some((block) => block.kind === 'heading'),
        hasDocumentMap: activeDocument.isMarkdown && blocks.length > 0,
      },
    ]
  }),
)
const adaptiveLayout = computed(() =>
  resolveAdaptiveEditorLayout({
    availableWidth: shellWidth.value,
    enabled: activeScreen.value.workbench === 'editor' && !layoutSettings.value.focusMode,
    showActivity: !layoutSettings.value.focusMode && appSettings.value.appearance.showActivityBar,
    activityWidth: activityWidth.value,
    showSidebar: requestedShowSidebar.value,
    preserveSidebar: preserveAdaptiveSidebar.value || adaptivePanes.value.length === 0,
    sidebarWidth: layoutSettings.value.sidebarWidth,
    showDocumentOutline: layoutSettings.value.showDocumentOutline,
    outlineWidth: layoutSettings.value.outlineWidth,
    showDocumentMap: layoutSettings.value.showDocumentMap,
    documentMapWidth: layoutSettings.value.documentMapWidth,
    protectedEditorWidth:
      clampNumber(
        appSettings.value.editor.visualMaxWidth,
        applicationSettingLimits.visualMaxWidth,
      ) +
      editorInlinePadding.value * 2,
    panes: adaptivePanes.value,
    splitStacked: splitStacked.value,
  }),
)
const showSidebar = computed(() => adaptiveLayout.value.showSidebar)
const showDocumentOutline = computed(() => adaptiveLayout.value.showDocumentOutline)
const showDocumentMap = computed(() => adaptiveLayout.value.showDocumentMap)
const activePaneIsRight = computed(() => activePaneId.value === 'right')
const moveActiveTabTitle = computed(() =>
  t(activePaneIsRight.value ? 'Move active tab left' : 'Move active tab right'),
)
const moveActiveTabIcon = computed(() => (activePaneIsRight.value ? PanelRightOpen : PanelLeftOpen))
const showDocumentToolbar = computed(
  () =>
    (activeScreen.value.workbench === 'editor' || layoutSettings.value.focusMode) &&
    activeDocument.value !== null &&
    isMarkdownDocument(activeDocument.value) &&
    activeDocumentMode.value === 'source',
)
const sourceDisabledToolbarCommands: EditorCommand[] = [
  'add-row-before',
  'add-row-after',
  'delete-row',
  'add-column-before',
  'add-column-after',
  'delete-column',
  'delete-table',
]
const visualDefaultDisabledToolbarCommands: EditorCommand[] = sourceDisabledToolbarCommands
const disabledToolbarCommands = computed(() =>
  activeDocumentMode.value === 'source'
    ? sourceDisabledToolbarCommands
    : (paneToolbarDisabledCommands.value[activePaneId.value] ??
      visualDefaultDisabledToolbarCommands),
)
const showSettingsView = computed(
  () => activeScreen.value.workbench === 'settings' && !layoutSettings.value.focusMode,
)
const showEditorView = computed(() => !showSettingsView.value)

function clampNumber(value: unknown, limit: { min: number; max: number; fallback: number }) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, limit.min), limit.max)
    : limit.fallback
}

function formatOpenDocumentsStatus(openCount: number, unsavedCount: number) {
  return unsavedCount > 0
    ? t('{count} open · {unsaved} unsaved', { count: openCount, unsaved: unsavedCount })
    : t('{count} open', { count: openCount })
}

function updateAppSettings(nextSettings: ApplicationSettings) {
  Object.assign(appSettings.value, nextSettings)
}

function handleActivitySection(section: ActivitySection) {
  preserveAdaptiveSidebar.value = true
  setActivitySection(section)
}

function handleCloseSidebar() {
  preserveAdaptiveSidebar.value = false
  closeSidebar()
}

watch(
  () => activeDocument.value?.id,
  () => {
    preserveAdaptiveSidebar.value = false
  },
)

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
    setSplitRatio(
      splitResizeStart.value.ratio +
        (event.clientX - splitResizeStart.value.x) / splitResizeStart.value.width,
    )
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

function updatePaneToolbarState(
  paneId: 'left' | 'right',
  state: { disabledCommands: EditorCommand[] },
) {
  paneToolbarDisabledCommands.value = {
    ...paneToolbarDisabledCommands.value,
    [paneId]: state.disabledCommands,
  }
}

onMounted(() => {
  if (!shellElement.value) return
  const updateShellWidth = () => {
    const nextWidth = shellElement.value?.clientWidth ?? window.innerWidth
    if (Number.isFinite(shellWidth.value) && nextWidth !== shellWidth.value) {
      preserveAdaptiveSidebar.value = false
    }
    shellWidth.value = nextWidth
  }
  updateShellWidth()
  shellResizeObserver = new ResizeObserver(updateShellWidth)
  shellResizeObserver.observe(shellElement.value)
})

onBeforeUnmount(() => {
  stopSidebarResize()
  stopSplitResize()
  shellResizeObserver?.disconnect()
  shellResizeObserver = null
})
</script>

<template>
  <main
    ref="shellElement"
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
    :data-theme="appSettings.appearance.theme"
    data-testid="app-shell"
  >
    <ActivityRail
      v-if="!layoutSettings.focusMode && appSettings.appearance.showActivityBar"
      :active-section="layoutSettings.activeActivitySection"
      :mode="layoutSettings.activityRailMode"
      :compact-width="layoutSettings.activityCompactWidth"
      :expanded-width="layoutSettings.activityExpandedWidth"
      @set-section="handleActivitySection"
      @set-mode="setActivityRailMode"
      @set-width="setActivityRailWidth"
      @reset-width="resetActivityRailWidth"
    />

    <aside
      v-if="showSidebar"
      class="workspace-sidebar"
      :class="{ 'sidebar-compact': layoutSettings.activityRailMode === 'compact' }"
      :aria-label="sidebarLabel"
      @click.self="clearSidebarSelection"
    >
      <template v-if="activeScreen.sidebar === 'settings'">
        <div class="workspace-header">
          <div>
            <p class="app-kicker">{{ t('Folden') }}</p>
            <h1>{{ t('Settings') }}</h1>
          </div>
        </div>
        <nav class="settings-nav" :aria-label="t('Settings sections')">
          <button
            type="button"
            class="settings-nav-button"
            :class="{ active: activeSettingsSection === 'editor' }"
            @click="activeSettingsSection = 'editor'"
          >
            {{ t('Editor') }}
          </button>
          <button
            type="button"
            class="settings-nav-button"
            :class="{ active: activeSettingsSection === 'files' }"
            @click="activeSettingsSection = 'files'"
          >
            {{ t('Files') }}
          </button>
          <button
            type="button"
            class="settings-nav-button"
            :class="{ active: activeSettingsSection === 'appearance' }"
            @click="activeSettingsSection = 'appearance'"
          >
            {{ t('Appearance') }}
          </button>
        </nav>
      </template>

      <template v-else-if="activeScreen.sidebar === 'workspace'">
        <div class="workspace-header">
          <div class="workspace-title-block">
            <p class="app-kicker">{{ t('Folden') }}</p>
            <h1>{{ workspace?.name ?? t('No workspace') }}</h1>
            <p
              v-if="workspace"
              class="workspace-root"
              :title="workspace.rootPath"
              data-testid="workspace-root"
            >
              {{ workspace.rootPath }}
            </p>
          </div>
          <button
            v-fit-label
            type="button"
            class="icon-button labelled-icon-button fit-label-button"
            :title="t('Open folder')"
            :aria-label="t('Open folder')"
            :disabled="!canExecuteCommand('workspace.open')"
            @click="executeCommand('workspace.open')"
          >
            <FolderOpen :size="17" />
            <span> {{ t('Open workspace') }} </span>
          </button>
        </div>

        <div class="workspace-sidebar-content">
          <OpenEditors
            v-model:collapsed="openEditorsCollapsed"
            :documents="documents"
            :visible-panes="visiblePanes"
            :active-pane="activePane"
            :active-pane-id="activePaneId"
            :document-labels="documentLabels"
            :clean-display-path="cleanDisplayPath"
            :is-dirty="isDirty"
            @select-document="(pane, documentId) => setActiveDocument(pane, documentId)"
          />

          <div v-if="workspace" class="workspace-tree-shell" @click.self="clearSidebarSelection">
            <div
              class="workspace-tree-actions"
              :class="{ 'compact-actions': layoutSettings.activityRailMode === 'compact' }"
              :aria-label="t('Workspace file actions')"
            >
              <button
                v-fit-label
                type="button"
                class="icon-button labelled-icon-button fit-label-button"
                :title="t('New scratch document')"
                :aria-label="t('New scratch document')"
                :disabled="!canExecuteCommand('document.new')"
                @click="executeCommand('document.new')"
              >
                <FilePenLine :size="uiIconSizes.workspaceAction" />
                <span> {{ t('New scratch') }} </span>
              </button>
              <button
                v-fit-label
                type="button"
                class="icon-button labelled-icon-button fit-label-button"
                :title="t('New file')"
                :aria-label="t('New file')"
                :disabled="!canExecuteCommand('workspace.createFile')"
                @click="executeCommand('workspace.createFile')"
              >
                <FilePlus :size="uiIconSizes.workspaceAction" />
                <span> {{ t('New file') }} </span>
              </button>
              <button
                v-fit-label
                type="button"
                class="icon-button labelled-icon-button fit-label-button"
                :title="t('New folder')"
                :aria-label="t('New folder')"
                :disabled="!canExecuteCommand('workspace.createDirectory')"
                @click="executeCommand('workspace.createDirectory')"
              >
                <FolderPlus :size="uiIconSizes.workspaceAction" />
                <span> {{ t('New folder') }} </span>
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
              @move-path="moveWorkspacePath"
              @trash-path="trashWorkspacePath"
              @hide-path="hideWorkspacePath"
              @toggle-directory="toggleWorkspaceDirectory"
            />
          </div>

          <section v-else class="empty-sidebar">
            <p>{{ t('Open a folder to start a workspace.') }}</p>
            <button
              type="button"
              :disabled="!canExecuteCommand('workspace.open')"
              data-testid="open-folder-empty"
              @click="executeCommand('workspace.open')"
            >
              {{ t('Open Folder') }}
            </button>

            <div v-if="recentWorkspaces.length" class="recent-workspaces">
              <p class="sidebar-label">{{ t('Recent') }}</p>
              <button
                v-for="path in recentWorkspaces"
                :key="path"
                type="button"
                class="recent-workspace"
                :title="path"
                @click="
                  runFileTask(
                    async () => loadWorkspace(await restoreWorkspaceByPath(path)),
                    t('Could not open recent workspace'),
                  )
                "
              >
                {{ workspaceNameFromPath(path) }}
              </button>
            </div>
          </section>
        </div>
      </template>

      <SearchSidebar
        v-else-if="activeScreen.sidebar === 'search'"
        :query="workspaceQuery"
        :match-case="workspaceCase"
        :results="workspaceResults"
        :busy="searchBusy"
        :partial="searchPartial"
        :skipped="searchSkipped"
        :error="searchError"
        :has-workspace="!!workspace"
        @query="workspaceQuery = $event"
        @match-case="workspaceCase = $event"
        @refresh="projectSearch.refresh()"
        @open="projectSearch.openResult($event)"
      />
      <section v-else class="create-sidebar">
        <h1>{{ t('Create') }}</h1>
        <button @click="createFromTemplate('empty')">{{ t('Empty document') }}</button>
        <button @click="createFromTemplate('note')">{{ t('Note') }}</button>
        <button @click="createFromTemplate('game')">{{ t('Game design document') }}</button>
        <button @click="createFromTemplate('video')">{{ t('Video script') }}</button>
      </section>

      <footer class="sidebar-footer">
        <button
          type="button"
          class="icon-button labelled-icon-button sidebar-close-button"
          :title="t('Close sidebar')"
          :aria-label="t('Close sidebar')"
          :disabled="!activeScreen.sidebarClosable"
          @click="handleCloseSidebar"
        >
          <PanelLeftClose :size="uiIconSizes.workspaceAction" />
          <span> {{ t('Close sidebar') }} </span>
        </button>
      </footer>
    </aside>

    <div
      v-if="showSidebar"
      class="sidebar-splitter"
      role="separator"
      :aria-label="t('Resize sidebar')"
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
          <span class="document-title" data-testid="document-title">{{
            activeDocument?.name ?? t('No document')
          }}</span>
          <div
            v-if="showEditorView"
            class="mode-switch topbar-mode-switch"
            :aria-label="t('Editor mode')"
          >
            <button
              type="button"
              class="icon-button labelled-icon-button"
              :title="t('Visual')"
              :aria-label="t('Visual')"
              :class="{ active: activeDocument && activeDocumentMode === 'visual' }"
              :disabled="!activeDocument || !isMarkdownDocument(activeDocument)"
              @click="
                activePane &&
                activeDocument &&
                setPaneDocumentMode(activePane, activeDocument, 'visual')
              "
            >
              <Eye :size="uiIconSizes.toolbar" />
              <span> {{ t('Visual') }} </span>
            </button>
            <button
              type="button"
              class="icon-button labelled-icon-button"
              :title="t('Source')"
              :aria-label="t('Source')"
              :class="{ active: activeDocument && activeDocumentMode === 'source' }"
              :disabled="!activeDocument"
              @click="
                activePane &&
                activeDocument &&
                setPaneDocumentMode(activePane, activeDocument, 'source')
              "
            >
              <FileCode2 :size="uiIconSizes.toolbar" />
              <span> {{ t('Source') }} </span>
            </button>
            <button
              type="button"
              class="icon-button labelled-icon-button"
              :title="t('Outline')"
              :aria-label="t('Outline')"
              :class="{ active: layoutSettings.showDocumentOutline }"
              :disabled="!activeDocument || !isMarkdownDocument(activeDocument)"
              @click="toggleDocumentOutline"
            >
              <ListTree :size="uiIconSizes.toolbar" />
              <span> {{ t('Outline') }} </span>
            </button>
            <button
              type="button"
              class="icon-button labelled-icon-button"
              :title="t('Document map')"
              :aria-label="t('Document map')"
              :class="{ active: layoutSettings.showDocumentMap }"
              :disabled="!activeDocument || !isMarkdownDocument(activeDocument)"
              @click="toggleDocumentMap"
            >
              <Map :size="uiIconSizes.toolbar" />
              <span> {{ t('Map') }} </span>
            </button>
          </div>
          <button
            v-if="
              activePaneDocument &&
              documentHasRemoteImages(activePaneDocument) &&
              !shouldLoadRemoteImages(activePaneDocument)
            "
            type="button"
            class="load-remote-images-button labelled-icon-button"
            data-testid="load-remote-images"
            :aria-label="t('Load remote images')"
            @click="allowRemoteImagesForDocument(activePaneDocument)"
          >
            <ImageIcon :size="uiIconSizes.toolbar" />
            <span> {{ t('Load remote images') }} </span>
          </button>
        </div>

        <div class="topbar-actions">
          <button
            type="button"
            class="icon-button labelled-icon-button"
            :title="t('Quick open') + ` (${primaryModifier}+P)`"
            :aria-label="t('Quick open')"
            :disabled="!workspace"
            @click="projectSearch.showQuickOpen()"
          >
            <FilePenLine :size="uiIconSizes.toolbar" />
          </button>
          <button
            type="button"
            class="icon-button"
            :title="t('Find') + ` (${primaryModifier}+F)`"
            :aria-label="t('Find')"
            @click="findOpen = !findOpen"
          >
            <Search :size="uiIconSizes.toolbar" />
          </button>
          <button
            type="button"
            class="icon-button"
            :title="t('Print / PDF') + ` (${primaryModifier}+${alternateModifier}+P)`"
            :aria-label="t('Print / PDF')"
            :disabled="!activeDocument || printPending"
            @click="preparePrint()"
          >
            <Printer :size="uiIconSizes.toolbar" />
          </button>
          <button
            type="button"
            class="icon-button"
            :title="t('Back')"
            :aria-label="t('Back')"
            :disabled="navigationIndex <= 0"
            @click="navigateHistory(-1)"
          >
            <ArrowLeft :size="uiIconSizes.toolbar" />
          </button>
          <button
            type="button"
            class="icon-button"
            :title="t('Forward')"
            :aria-label="t('Forward')"
            :disabled="navigationIndex >= navigationHistory.length - 1"
            @click="navigateHistory(1)"
          >
            <ArrowRight :size="uiIconSizes.toolbar" />
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            :title="t('Open file')"
            :aria-label="t('Open file')"
            :disabled="!canExecuteCommand('document.open')"
            @click="executeCommand('document.open')"
          >
            <FolderOpen :size="uiIconSizes.toolbar" />
            <span> {{ t('Open') }} </span>
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            :title="t('Save')"
            :aria-label="t('Save')"
            data-testid="save-document"
            :disabled="!canExecuteCommand('document.save')"
            @click="executeCommand('document.save')"
          >
            <Save :size="uiIconSizes.toolbar" />
            <span> {{ t('Save') }} </span>
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            :title="t('Focus mode')"
            :aria-label="t('Focus mode')"
            :class="{ active: layoutSettings.focusMode }"
            @click="toggleFocusMode"
          >
            <Focus :size="uiIconSizes.toolbar" />
            <span> {{ t('Focus') }} </span>
          </button>
          <button
            type="button"
            class="icon-button labelled-icon-button"
            :title="t('Toggle split view')"
            :aria-label="t('Toggle split view')"
            :class="{ active: splitEnabled }"
            :disabled="!canExecuteCommand('layout.toggleSplit')"
            @click="executeCommand('layout.toggleSplit')"
          >
            <Columns2 :size="uiIconSizes.toolbar" />
            <span> {{ t('Split') }} </span>
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
            <span>{{ t(activePaneIsRight ? 'Move left' : 'Move right') }}</span>
          </button>
        </div>
      </header>

      <SettingsView
        v-if="showSettingsView"
        :app-settings="appSettings"
        :active-section="activeSettingsSection"
        :can-export-diagnostics="canExecuteCommand('diagnostics.export')"
        @update-settings="updateAppSettings"
        @reset-layout="resetLayoutSettings"
        @export-diagnostics="executeCommand('diagnostics.export')"
        @show-about="aboutOpen = true"
      />

      <div
        v-if="errorMessage || watcherWarning || analysisWarning"
        class="toast-stack"
        aria-live="polite"
      >
        <p :class="errorMessage ? 'toast-message error-message' : 'toast-message warning-message'">
          {{ errorMessage ?? watcherWarning ?? analysisWarning }}
        </p>
      </div>
      <section
        v-if="showEditorView && activeDocument?.externalState === 'conflict'"
        class="document-warning"
        data-testid="conflict-warning"
      >
        <div>
          <strong> {{ t('External changes detected.') }} </strong>
          <span>{{
            activeDocument.externalMessage ??
            t('Compare Folden and disk versions before continuing.')
          }}</span>
        </div>
        <div class="document-warning-actions">
          <button
            type="button"
            data-testid="resolve-conflict"
            @click="
              runFileTask(
                () => openConflictResolution(activeDocument!.id),
                t('Could not open conflict comparison'),
              )
            "
          >
            {{ t('Resolve conflict') }}
          </button>
          <button type="button" @click="saveDocumentAsCopy(activeDocument!)">
            {{ t('Save As') }}
          </button>
          <button type="button" @click="clearDocumentExternalState(activeDocument!.id)">
            {{ t('Later') }}
          </button>
        </div>
      </section>
      <section
        v-else-if="showEditorView && activeDocument?.externalState === 'missing'"
        class="document-warning"
      >
        <div>
          <strong> {{ t('File is missing on disk.') }} </strong>
          <span>{{ activeDocument.externalMessage }}</span>
        </div>
        <div class="document-warning-actions">
          <button type="button" @click="saveDocumentAsCopy(activeDocument)">
            {{ t('Save As') }}
          </button>
          <button type="button" @click="reloadDocumentFromDisk(activeDocument.id)">
            {{ t('Retry reload') }}
          </button>
        </div>
      </section>

      <DocumentToolbar
        v-if="showDocumentToolbar"
        :disabled-commands="disabledToolbarCommands"
        @run-command="runActiveEditorCommand"
      />

      <EditorPaneGrid
        v-if="showEditorView"
        :document-analyses="documentAnalyses"
        :visible-panes="editorPaneViews"
        :active-pane-id="activePaneId"
        :split-enabled="splitEnabled"
        :split-ratio="layoutSettings.splitRatio"
        :source-word-wrap="appSettings.editor.wordWrap"
        :outline-width="layoutSettings.outlineWidth"
        :document-map-width="layoutSettings.documentMapWidth"
        :show-document-outline="showDocumentOutline"
        :show-document-map="showDocumentMap"
        :workspace-root-path="workspace?.rootPath ?? null"
        :close-document="closeDocument"
        :open-dropped-path="openDroppedPath"
        :open-workspace-file="openWorkspaceFile"
        :set-active-document="setActiveDocument"
        :set-pane-editor-adapter="setPaneEditorAdapter"
        @begin-split-resize="beginSplitResize"
        @keyboard-split-resize="resizeSplitWithKeyboard"
        @set-outline-width="setOutlineWidth"
        @set-document-map-width="setDocumentMapWidth"
        @document-update="handleDocumentUpdate"
        @navigate-link="navigateLink"
        @image-import="importImage"
        @history-command="executeCommand($event === 'undo' ? 'document.undo' : 'document.redo')"
        @toolbar-state="updatePaneToolbarState"
        @move-document-between-panes="moveDocumentIdBetweenPanes"
        @reorder-document-in-pane="reorderDocumentInPane"
        @reset-layout="resetLayoutSettings"
        @set-active-pane="setActivePane"
      />

      <div v-if="showWelcome && showEditorView" class="welcome-view">
        <h1>{{ t('Folden') }}</h1>
        <p>{{ t('Start a project') }}</p>
        <button @click="executeCommand('workspace.open')">{{ t('Open Folder') }}</button>
        <button @click="welcomeDismissed = true">{{ t('New document') }}</button>
        <button
          v-for="path in recentWorkspaces"
          :key="path"
          @click="
            runFileTask(
              async () => loadWorkspace(await restoreWorkspaceByPath(path)),
              t('Could not open recent workspace'),
            )
          "
        >
          {{ workspaceNameFromPath(path) }}
        </button>
        <p>{{ t('Write / to insert a block.') }}</p>
      </div>

      <FindPanel
        v-if="findOpen && showEditorView"
        :query="findQuery"
        :replacement="findReplacement"
        :match-case="findCase"
        :count="findCount"
        :index="findIndex"
        :mode="activeDocumentMode ?? 'source'"
        :replace="findReplace"
        @query="findQuery = $event"
        @replacement="findReplacement = $event"
        @match-case="findCase = $event"
        @next="nextFind"
        @replace-one="replaceFind(false)"
        @replace-all="replaceFind(true)"
        @close="findOpen = false"
      />

      <footer
        v-if="showEditorView && appSettings.appearance.showStatusBar && !layoutSettings.focusMode"
        class="statusbar"
      >
        <span data-testid="open-documents-status">{{
          formatOpenDocumentsStatus(documents.length, dirtyDocuments.length)
        }}</span>
        <span
          class="path-status"
          :title="
            activeDocument?.path ? cleanDisplayPath(activeDocument.path) : t('Scratch document')
          "
          data-testid="status-path"
        >
          {{ activeLocation }}
        </span>
        <span>{{
          activeDocument
            ? t('{count} chars', { count: activeDocument.content.length })
            : t('No document')
        }}</span>
        <span v-if="activeDocument">{{
          t('{count} words', { count: activeDocumentWordCount })
        }}</span>
        <span v-if="activeDocumentMode">{{
          t(activeDocumentMode === 'source' ? 'Source' : 'Visual')
        }}</span>
      </footer>
    </section>
  </main>

  <QuickOpenDialog
    v-if="quickOpen"
    :query="quickQuery"
    :files="quickResults"
    :busy="quickBusy"
    :error="quickError"
    :partial="quickPartial"
    @query="quickQuery = $event"
    @open="projectSearch.chooseQuickFile($event)"
    @close="projectSearch.closeQuickOpen()"
  />
  <PrintView
    v-if="printSnapshot"
    :snapshot="printSnapshot"
    @close="closePrint"
    @launched="printPending = false"
    @error="errorMessage = $event"
  />

  <PromptDialog
    :open="!!promptDialog"
    :title="promptDialog?.title ?? ''"
    :message="promptDialog?.message ?? ''"
    :initial-value="promptDialog?.initialValue ?? ''"
    :placeholder="promptDialog?.placeholder ?? ''"
    :confirm-label="promptDialog?.confirmLabel ?? t('Save')"
    :input-label="promptDialog?.inputLabel ?? t('Value')"
    :error="promptDialogError"
    @submit="submitPromptDialog"
    @cancel="cancelPromptDialog"
  />

  <ConfirmDialog
    :open="!!confirmDialog"
    :title="confirmDialog?.title ?? ''"
    :message="confirmDialog?.message ?? ''"
    :confirm-label="confirmDialog?.confirmLabel ?? t('Confirm')"
    :cancel-label="confirmDialog?.cancelLabel ?? t('Cancel')"
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
    :save-label="unsavedDialog?.saveLabel ?? t('Save')"
    :discard-label="unsavedDialog?.discardLabel ?? t('Discard')"
    :cancel-label="unsavedDialog?.cancelLabel ?? t('Cancel')"
    :show-save="unsavedDialog?.showSave ?? true"
    @save="resolveUnsavedDialog('save')"
    @discard="resolveUnsavedDialog('discard')"
    @cancel="resolveUnsavedDialog('cancel')"
  />

  <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />

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
