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
import { ref } from 'vue'
import type { WorkspaceEntry } from './tauriFiles'

defineOptions({
  name: 'WorkspaceTree',
})

const props = defineProps<{
  entries: WorkspaceEntry[]
  activePath: string | null
  selectedPath: string | null
  level?: number
}>()

const emit = defineEmits<{
  clearSelection: []
  openFile: [entry: WorkspaceEntry]
  selectPath: [entry: WorkspaceEntry]
  createFile: [entry: WorkspaceEntry]
  createDirectory: [entry: WorkspaceEntry]
  renamePath: [entry: WorkspaceEntry]
  trashPath: [entry: WorkspaceEntry]
}>()

const collapsedPaths = ref(new Set<string>())

function isDirectory(entry: WorkspaceEntry) {
  return entry.kind === 'directory'
}

function isExpanded(entry: WorkspaceEntry) {
  return !collapsedPaths.value.has(entry.path)
}

function normalizePath(path: string) {
  return path.replaceAll('/', '\\').toLowerCase()
}

function pathMatches(left: string | null, right: string) {
  return left ? normalizePath(left) === normalizePath(right) : false
}

function toggleDirectory(entry: WorkspaceEntry) {
  const collapsed = new Set(collapsedPaths.value)

  if (collapsed.has(entry.path)) {
    collapsed.delete(entry.path)
  } else {
    collapsed.add(entry.path)
  }

  collapsedPaths.value = collapsed
}

function selectEntry(entry: WorkspaceEntry) {
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
    :style="{ '--tree-level': level ?? 0 }"
    @click.self="emit('clearSelection')"
  >
    <li v-for="entry in props.entries" :key="entry.path" class="workspace-tree-item">
      <div
        class="tree-row"
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
          @click.stop="toggleDirectory(entry)"
        >
          <ChevronDown v-if="isExpanded(entry)" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>
        <span v-else class="tree-toggle-spacer" />

        <Folder v-if="isDirectory(entry)" class="tree-icon" :size="15" />
        <FileText v-else class="tree-icon" :size="15" />
        <span class="tree-name">{{ entry.name }}</span>

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
        :level="(level ?? 0) + 1"
        @open-file="emit('openFile', $event)"
        @clear-selection="emit('clearSelection')"
        @select-path="emit('selectPath', $event)"
        @create-file="emit('createFile', $event)"
        @create-directory="emit('createDirectory', $event)"
        @rename-path="emit('renamePath', $event)"
        @trash-path="emit('trashPath', $event)"
      />
    </li>
  </ul>
</template>
