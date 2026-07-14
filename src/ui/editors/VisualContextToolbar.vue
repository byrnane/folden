<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Bold,
  Code2,
  Columns3,
  ExternalLink,
  FileCode2,
  Italic,
  Link,
  Pencil,
  RemoveFormatting,
  Rows3,
  Strikethrough,
  TextCursorInput,
  Trash2,
  Unlink,
} from 'lucide-vue-next'
import type { EditorCommand } from '../../application/types/shell'
import { uiIconSizes } from '../uiConstants'

export type VisualContextToolbarContext = 'text' | 'link' | 'image' | 'table'

const props = defineProps<{
  context: VisualContextToolbarContext
  position: { top: number; left: number }
}>()

const toolbarElement = ref<HTMLDivElement | null>(null)
const clampedPosition = ref(props.position)

async function clampToViewport() {
  clampedPosition.value = props.position
  await nextTick()
  const toolbar = toolbarElement.value
  if (!toolbar) return
  const margin = 12
  const rect = toolbar.getBoundingClientRect()
  let left = props.position.left
  let top = props.position.top
  if (rect.left < margin) left += margin - rect.left
  if (rect.right > window.innerWidth - margin) left -= rect.right - window.innerWidth + margin
  if (rect.top < margin) top += margin - rect.top
  if (rect.bottom > window.innerHeight - margin) top -= rect.bottom - window.innerHeight + margin
  clampedPosition.value = { top, left }
}

watch(() => [props.context, props.position.top, props.position.left], clampToViewport)
onMounted(() => {
  clampToViewport()
  window.addEventListener('resize', clampToViewport)
})
onBeforeUnmount(() => window.removeEventListener('resize', clampToViewport))

const emit = defineEmits<{
  runCommand: [command: EditorCommand]
  editImageSource: []
  editImageAlt: []
  deleteNode: []
  openLink: []
  editLink: []
  removeLink: []
}>()
</script>

<template>
  <div
    ref="toolbarElement"
    class="visual-context-menu"
    :style="{ top: `${clampedPosition.top}px`, left: `${clampedPosition.left}px` }"
    :data-context="context"
    data-testid="visual-context-menu"
  >
    <template v-if="context === 'table'">
      <button
        type="button"
        title="Add row before"
        aria-label="Add row before"
        @click="emit('runCommand', 'add-row-before')"
      >
        <ArrowUpToLine :size="uiIconSizes.toolbar" />
        <span>Add row before</span>
      </button>
      <button
        type="button"
        title="Add row after"
        aria-label="Add row after"
        @click="emit('runCommand', 'add-row-after')"
      >
        <ArrowDownToLine :size="uiIconSizes.toolbar" />
        <span>Add row after</span>
      </button>
      <button
        type="button"
        title="Delete row"
        aria-label="Delete row"
        @click="emit('runCommand', 'delete-row')"
      >
        <Rows3 :size="uiIconSizes.toolbar" />
        <span>Delete row</span>
      </button>
      <button
        type="button"
        title="Add column before"
        aria-label="Add column before"
        @click="emit('runCommand', 'add-column-before')"
      >
        <ArrowLeftToLine :size="uiIconSizes.toolbar" />
        <span>Add column before</span>
      </button>
      <button
        type="button"
        title="Add column after"
        aria-label="Add column after"
        @click="emit('runCommand', 'add-column-after')"
      >
        <ArrowRightToLine :size="uiIconSizes.toolbar" />
        <span>Add column after</span>
      </button>
      <button
        type="button"
        title="Delete column"
        aria-label="Delete column"
        @click="emit('runCommand', 'delete-column')"
      >
        <Columns3 :size="uiIconSizes.toolbar" />
        <span>Delete column</span>
      </button>
      <button
        type="button"
        title="Delete table"
        aria-label="Delete table"
        @click="emit('runCommand', 'delete-table')"
      >
        <Trash2 :size="uiIconSizes.toolbar" />
        <span>Delete table</span>
      </button>
    </template>

    <template v-else-if="context === 'image'">
      <button type="button" title="Source" aria-label="Source" @click="emit('editImageSource')">
        <FileCode2 :size="uiIconSizes.toolbar" />
        <span>Source</span>
      </button>
      <button type="button" title="Alt" aria-label="Alt" @click="emit('editImageAlt')">
        <TextCursorInput :size="uiIconSizes.toolbar" />
        <span>Alt</span>
      </button>
      <button
        type="button"
        title="Delete image"
        aria-label="Delete image"
        @click="emit('deleteNode')"
      >
        <Trash2 :size="uiIconSizes.toolbar" />
        <span>Delete</span>
      </button>
    </template>

    <template v-else-if="context === 'link'">
      <button type="button" title="Open link" aria-label="Open link" @click="emit('openLink')">
        <ExternalLink :size="uiIconSizes.toolbar" />
        <span>Open</span>
      </button>
      <button type="button" title="Edit link" aria-label="Edit link" @click="emit('editLink')">
        <Pencil :size="uiIconSizes.toolbar" />
        <span>Edit</span>
      </button>
      <button
        type="button"
        title="Remove link"
        aria-label="Remove link"
        @click="emit('removeLink')"
      >
        <Unlink :size="uiIconSizes.toolbar" />
        <span>Remove</span>
      </button>
    </template>

    <template v-else>
      <button type="button" title="Bold" aria-label="Bold" @click="emit('runCommand', 'bold')">
        <Bold :size="uiIconSizes.toolbar" />
        <span>Bold</span>
      </button>
      <button
        type="button"
        title="Italic"
        aria-label="Italic"
        @click="emit('runCommand', 'italic')"
      >
        <Italic :size="uiIconSizes.toolbar" />
        <span>Italic</span>
      </button>
      <button
        type="button"
        title="Strike"
        aria-label="Strike"
        @click="emit('runCommand', 'strike')"
      >
        <Strikethrough :size="uiIconSizes.toolbar" />
        <span>Strike</span>
      </button>
      <button
        type="button"
        title="Code"
        aria-label="Code"
        @click="emit('runCommand', 'inline-code')"
      >
        <Code2 :size="uiIconSizes.toolbar" />
        <span>Code</span>
      </button>
      <button type="button" title="Link" aria-label="Link" @click="emit('runCommand', 'link')">
        <Link :size="uiIconSizes.toolbar" />
        <span>Link</span>
      </button>
      <button
        type="button"
        title="Clear"
        aria-label="Clear"
        @click="emit('runCommand', 'clear-formatting')"
      >
        <RemoveFormatting :size="uiIconSizes.toolbar" />
        <span>Clear</span>
      </button>
    </template>
  </div>
</template>
