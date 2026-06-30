<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import type { WorkspaceEntry } from '../../infrastructure/tauri/files'

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
  toggleDirectory: [entry: WorkspaceTreeEntry]
}>()

type WorkspaceTreeEntry = Omit<Readonly<WorkspaceEntry>, 'children'> & {
  readonly children: readonly WorkspaceTreeEntry[]
}

function isDirectory(entry: WorkspaceTreeEntry) {
  return entry.kind === 'directory'
}

function isExpanded(entry: WorkspaceTreeEntry) {
  return props.expandedPaths.has(entry.path)
}

function normalizePath(path: string) {
  return path.replaceAll('/', '\\').toLowerCase()
}

function pathMatches(left: string | null, right: string) {
  return left ? normalizePath(left) === normalizePath(right) : false
}

function isLoading(entry: WorkspaceTreeEntry) {
  return props.loadingPaths.has(entry.path)
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
        }"
        :title="entry.path"
        @click="selectEntry(entry)"
      >
        <button
          v-if="isDirectory(entry)"
          type="button"
          class="tree-toggle icon-button"
          :title="isExpanded(entry) ? 'Collapse folder' : 'Expand folder'"
          :disabled="isLoading(entry)"
          @click.stop="toggleDirectory(entry)"
        >
          <ChevronDown v-if="isExpanded(entry)" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>
        <span v-else class="tree-toggle-spacer" />

        <Folder v-if="isDirectory(entry)" class="tree-icon" :size="15" />
        <FileText v-else class="tree-icon" :size="15" />
        <span class="tree-name">{{ entry.name }}</span>
        <span v-if="isDirectory(entry) && isLoading(entry)" class="tree-meta">Loading...</span>
        <span v-else-if="loadErrors[entry.path]" class="tree-meta danger-text" :title="loadErrors[entry.path]">
          Error
        </span>

        <span class="tree-actions">
          <button
            v-if="isDirectory(entry)"
            type="button"
            class="tree-action icon-button"
            title="New file"
            @click.stop="emit('createFile', entry)"
          >
            <FilePlus :size="13" />
          </button>
          <button
            v-if="isDirectory(entry)"
            type="button"
            class="tree-action icon-button"
            title="New folder"
            @click.stop="emit('createDirectory', entry)"
          >
            <FolderPlus :size="13" />
          </button>
          <button
            type="button"
            class="tree-action icon-button"
            title="Rename"
            @click.stop="emit('renamePath', entry)"
          >
            <Pencil :size="13" />
          </button>
          <button
            type="button"
            class="tree-action icon-button danger"
            title="Move to trash"
            @click.stop="emit('trashPath', entry)"
          >
            <Trash2 :size="13" />
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
        @clear-selection="emit('clearSelection')"
        @select-path="emit('selectPath', $event)"
        @create-file="emit('createFile', $event)"
        @create-directory="emit('createDirectory', $event)"
        @rename-path="emit('renamePath', $event)"
        @trash-path="emit('trashPath', $event)"
        @toggle-directory="emit('toggleDirectory', $event)"
      />
    </li>
  </ul>
</template>
