<script setup lang="ts">
import { t } from '../../application/i18n'
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  EyeOff,
  Pencil,
  FolderInput,
  Trash2,
} from 'lucide-vue-next'
import type { WorkspaceEntry } from '../../domain/native'
import { startDocumentDrag } from '../documentDrag'
import { uiIconSizes } from '../uiConstants'
import { normalizePath } from '../../application/helpers/pathHelpers'

defineOptions({
  name: 'WorkspaceTree',
})

const props = defineProps<{
  entries: readonly WorkspaceTreeEntry[]
  activePath: string | null
  selectedPath: string | null
  expandedPaths: ReadonlySet<string>
  loadingPaths: ReadonlySet<string>
  loadErrors: Readonly<Record<string, string>>
  level?: number
}>()

const emit = defineEmits<{
  clearSelection: []
  openFile: [entry: WorkspaceTreeEntry]
  selectPath: [entry: WorkspaceTreeEntry]
  createFile: [entry: WorkspaceTreeEntry]
  createDirectory: [entry: WorkspaceTreeEntry]
  renamePath: [entry: WorkspaceTreeEntry]
  trashPath: [entry: WorkspaceTreeEntry]
  hidePath: [entry: WorkspaceTreeEntry]
  toggleDirectory: [entry: WorkspaceTreeEntry]
  movePath: [entry: WorkspaceTreeEntry, targetParent?: string]
}>()

const workspaceMoveMime = 'application/x-folden-workspace-path'
function dropOnFolder(event: DragEvent, entry: WorkspaceTreeEntry) {
  if (entry.kind !== 'directory') return
  const path = event.dataTransfer?.getData(workspaceMoveMime)
  if (!path || path === entry.path) return
  event.preventDefault()
  event.stopPropagation()
  emit(
    'movePath',
    {
      path,
      name: path.split(/[\\/]/).at(-1) ?? path,
      kind: 'file',
      children: [],
      openableState: 'unknown',
    },
    entry.path,
  )
}

type WorkspaceTreeEntry = Omit<Readonly<WorkspaceEntry>, 'children'> & {
  readonly children: readonly WorkspaceTreeEntry[]
}

function isDirectory(entry: WorkspaceTreeEntry) {
  return entry.kind === 'directory'
}

function isExpanded(entry: WorkspaceTreeEntry) {
  return props.expandedPaths.has(entry.path)
}

function pathMatches(left: string | null, right: string) {
  return left ? normalizePath(left) === normalizePath(right) : false
}

function isLoading(entry: WorkspaceTreeEntry) {
  return props.loadingPaths.has(entry.path)
}

function rowTitle(entry: WorkspaceTreeEntry) {
  if (isDirectory(entry) && entry.openableState === 'empty') {
    return t('{path} - No supported files', { path: entry.path })
  }

  return entry.path
}

function toggleDirectory(entry: WorkspaceTreeEntry) {
  emit('toggleDirectory', entry)
}

function selectEntry(entry: WorkspaceTreeEntry) {
  emit('selectPath', entry)

  if (isDirectory(entry)) {
    toggleDirectory(entry)
    return
  }

  emit('openFile', entry)
}

function startWorkspaceFileDrag(event: DragEvent, entry: WorkspaceTreeEntry) {
  event.dataTransfer?.setData(workspaceMoveMime, entry.path)
  if (isDirectory(entry)) {
    return
  }

  startDocumentDrag(event, {
    kind: 'workspace-file',
    path: entry.path,
    label: entry.name,
  })
}
</script>

<template>
  <ul
    class="workspace-tree"
    data-testid="workspace-tree"
    :style="{ '--tree-level': level ?? 0 }"
    @click.self="emit('clearSelection')"
  >
    <li v-for="entry in props.entries" :key="entry.path" class="workspace-tree-item">
      <div
        class="tree-row"
        :data-testid="`workspace-entry-${entry.path}`"
        :class="{
          active: pathMatches(activePath, entry.path),
          selected: pathMatches(selectedPath, entry.path),
          muted: isDirectory(entry) && entry.openableState === 'empty',
        }"
        :title="rowTitle(entry)"
        draggable="true"
        @dragstart="startWorkspaceFileDrag($event, entry)"
        @dragover="isDirectory(entry) && $event.preventDefault()"
        @drop="dropOnFolder($event, entry)"
        @click="selectEntry(entry)"
      >
        <button
          v-if="isDirectory(entry)"
          type="button"
          class="tree-toggle icon-button"
          :title="t(isExpanded(entry) ? 'Collapse folder' : 'Expand folder')"
          :disabled="isLoading(entry)"
          @click.stop="toggleDirectory(entry)"
        >
          <ChevronDown v-if="isExpanded(entry)" :size="uiIconSizes.workspaceTreeChevron" />
          <ChevronRight v-else :size="uiIconSizes.workspaceTreeChevron" />
        </button>
        <span v-else class="tree-toggle-spacer" />

        <Folder v-if="isDirectory(entry)" class="tree-icon" :size="uiIconSizes.workspaceTreeIcon" />
        <FileText v-else class="tree-icon" :size="uiIconSizes.workspaceTreeIcon" />
        <span class="tree-name">{{ entry.name }}</span>
        <span v-if="isDirectory(entry) && isLoading(entry)" class="tree-meta">{{
          t('Loading...')
        }}</span>
        <span
          v-else-if="loadErrors[entry.path]"
          class="tree-meta danger-text"
          :title="loadErrors[entry.path]"
        >
          {{ t('Error') }}
        </span>

        <span
          v-if="pathMatches(activePath, entry.path) || pathMatches(selectedPath, entry.path)"
          class="tree-actions"
          @pointerdown.stop
          @dragstart.stop.prevent
        >
          <button
            type="button"
            class="tree-action icon-button"
            :title="t('Move')"
            :aria-label="t('Move')"
            draggable="false"
            @click.stop="emit('movePath', entry)"
          >
            <FolderInput :size="uiIconSizes.workspaceTreeAction" />
          </button>
          <button
            v-if="isDirectory(entry)"
            type="button"
            class="tree-action icon-button"
            draggable="false"
            :title="t('New file')"
            :aria-label="t('New file')"
            @click.stop="emit('createFile', entry)"
          >
            <FilePlus :size="uiIconSizes.workspaceTreeAction" />
          </button>
          <button
            v-if="isDirectory(entry)"
            type="button"
            class="tree-action icon-button"
            draggable="false"
            :title="t('New folder')"
            :aria-label="t('New folder')"
            @click.stop="emit('createDirectory', entry)"
          >
            <FolderPlus :size="uiIconSizes.workspaceTreeAction" />
          </button>
          <button
            type="button"
            class="tree-action icon-button"
            draggable="false"
            :title="t('Rename')"
            :aria-label="t('Rename')"
            @click.stop="emit('renamePath', entry)"
          >
            <Pencil :size="uiIconSizes.workspaceTreeAction" />
          </button>
          <button
            type="button"
            class="tree-action icon-button"
            draggable="false"
            :title="t('Hide from workspace')"
            :aria-label="t('Hide from workspace')"
            @click.stop="emit('hidePath', entry)"
          >
            <EyeOff :size="uiIconSizes.workspaceTreeAction" />
          </button>
          <button
            type="button"
            class="tree-action icon-button danger"
            draggable="false"
            :title="t('Move to trash')"
            :aria-label="t('Move to trash')"
            @click.stop="emit('trashPath', entry)"
          >
            <Trash2 :size="uiIconSizes.workspaceTreeAction" />
          </button>
        </span>
      </div>

      <WorkspaceTree
        v-if="isDirectory(entry) && isExpanded(entry)"
        :entries="entry.children"
        :active-path="activePath"
        :selected-path="selectedPath"
        :expanded-paths="expandedPaths"
        :loading-paths="loadingPaths"
        :load-errors="loadErrors"
        :level="(level ?? 0) + 1"
        @open-file="emit('openFile', $event)"
        @move-path="(entry, target) => emit('movePath', entry, target)"
        @clear-selection="emit('clearSelection')"
        @select-path="emit('selectPath', $event)"
        @create-file="emit('createFile', $event)"
        @create-directory="emit('createDirectory', $event)"
        @rename-path="emit('renamePath', $event)"
        @trash-path="emit('trashPath', $event)"
        @hide-path="emit('hidePath', $event)"
        @toggle-directory="emit('toggleDirectory', $event)"
      />
    </li>
  </ul>
</template>
