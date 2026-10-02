<script setup lang="ts">
import { t } from '../../application/i18n'
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
        :title="t('Add row before')"
        :aria-label="t('Add row before')"
        @click="emit('runCommand', 'add-row-before')"
      >
        <ArrowUpToLine :size="uiIconSizes.toolbar" />
        <span>{{ t('Add row before') }}</span>
      </button>
      <button
        type="button"
        :title="t('Add row after')"
        :aria-label="t('Add row after')"
        @click="emit('runCommand', 'add-row-after')"
      >
        <ArrowDownToLine :size="uiIconSizes.toolbar" />
        <span>{{ t('Add row after') }}</span>
      </button>
      <button
        type="button"
        :title="t('Delete row')"
        :aria-label="t('Delete row')"
        @click="emit('runCommand', 'delete-row')"
      >
        <Rows3 :size="uiIconSizes.toolbar" />
        <span>{{ t('Delete row') }}</span>
      </button>
      <button
        type="button"
        :title="t('Add column before')"
        :aria-label="t('Add column before')"
        @click="emit('runCommand', 'add-column-before')"
      >
        <ArrowLeftToLine :size="uiIconSizes.toolbar" />
        <span>{{ t('Add column before') }}</span>
      </button>
      <button
        type="button"
        :title="t('Add column after')"
        :aria-label="t('Add column after')"
        @click="emit('runCommand', 'add-column-after')"
      >
        <ArrowRightToLine :size="uiIconSizes.toolbar" />
        <span>{{ t('Add column after') }}</span>
      </button>
      <button
        type="button"
        :title="t('Delete column')"
        :aria-label="t('Delete column')"
        @click="emit('runCommand', 'delete-column')"
      >
        <Columns3 :size="uiIconSizes.toolbar" />
        <span>{{ t('Delete column') }}</span>
      </button>
      <button
        type="button"
        :title="t('Delete table')"
        :aria-label="t('Delete table')"
        @click="emit('runCommand', 'delete-table')"
      >
        <Trash2 :size="uiIconSizes.toolbar" />
        <span>{{ t('Delete table') }}</span>
      </button>
    </template>

    <template v-else-if="context === 'image'">
      <button
        type="button"
        :title="t('Source')"
        :aria-label="t('Source')"
        @click="emit('editImageSource')"
      >
        <FileCode2 :size="uiIconSizes.toolbar" />
        <span>{{ t('Source') }}</span>
      </button>
      <button type="button" :title="t('Alt')" :aria-label="t('Alt')" @click="emit('editImageAlt')">
        <TextCursorInput :size="uiIconSizes.toolbar" />
        <span>{{ t('Alt') }}</span>
      </button>
      <button
        type="button"
        :title="t('Delete image')"
        :aria-label="t('Delete image')"
        @click="emit('deleteNode')"
      >
        <Trash2 :size="uiIconSizes.toolbar" />
        <span>{{ t('Delete') }}</span>
      </button>
    </template>

    <template v-else-if="context === 'link'">
      <button
        type="button"
        :title="t('Open link')"
        :aria-label="t('Open link')"
        @click="emit('openLink')"
      >
        <ExternalLink :size="uiIconSizes.toolbar" />
        <span>{{ t('Open') }}</span>
      </button>
      <button
        type="button"
        :title="t('Edit link')"
        :aria-label="t('Edit link')"
        @click="emit('editLink')"
      >
        <Pencil :size="uiIconSizes.toolbar" />
        <span>{{ t('Edit') }}</span>
      </button>
      <button
        type="button"
        :title="t('Remove link')"
        :aria-label="t('Remove link')"
        @click="emit('removeLink')"
      >
        <Unlink :size="uiIconSizes.toolbar" />
        <span>{{ t('Remove') }}</span>
      </button>
    </template>

    <template v-else>
      <button
        type="button"
        :title="t('Bold')"
        :aria-label="t('Bold')"
        @click="emit('runCommand', 'bold')"
      >
        <Bold :size="uiIconSizes.toolbar" />
        <span>{{ t('Bold') }}</span>
      </button>
      <button
        type="button"
        :title="t('Italic')"
        :aria-label="t('Italic')"
        @click="emit('runCommand', 'italic')"
      >
        <Italic :size="uiIconSizes.toolbar" />
        <span>{{ t('Italic') }}</span>
      </button>
      <button
        type="button"
        :title="t('Strike')"
        :aria-label="t('Strike')"
        @click="emit('runCommand', 'strike')"
      >
        <Strikethrough :size="uiIconSizes.toolbar" />
        <span>{{ t('Strike') }}</span>
      </button>
      <button
        type="button"
        :title="t('Code')"
        :aria-label="t('Code')"
        @click="emit('runCommand', 'inline-code')"
      >
        <Code2 :size="uiIconSizes.toolbar" />
        <span>{{ t('Code') }}</span>
      </button>
      <button
        type="button"
        :title="t('Link')"
        :aria-label="t('Link')"
        @click="emit('runCommand', 'link')"
      >
        <Link :size="uiIconSizes.toolbar" />
        <span>{{ t('Link') }}</span>
      </button>
      <button
        type="button"
        :title="t('Clear')"
        :aria-label="t('Clear')"
        @click="emit('runCommand', 'clear-formatting')"
      >
        <RemoveFormatting :size="uiIconSizes.toolbar" />
        <span>{{ t('Clear') }}</span>
      </button>
    </template>
  </div>
</template>
