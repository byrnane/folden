<script setup lang="ts">
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
} from 'lucide-vue-next'
import { ref, type Component } from 'vue'
import type { VisualEditorCommand } from '../../application/types/shell'
import { uiIconSizes } from '../uiConstants'

type VisualToolbarItem = {
  command: VisualEditorCommand
  title: string
  label: string
  icon?: Component
}

const emit = defineEmits<{
  runCommand: [command: VisualEditorCommand]
}>()

const headingsMenuOpen = ref(false)

const headingToolbarCommands: VisualToolbarItem[] = [
  { command: 'heading-1', title: 'Heading 1', label: 'Heading 1', icon: Heading1 },
  { command: 'heading-2', title: 'Heading 2', label: 'Heading 2', icon: Heading2 },
  { command: 'heading-3', title: 'Subtitle', label: 'Subtitle', icon: Heading3 },
  { command: 'heading-4', title: 'Heading 4', label: 'Heading 4', icon: Heading3 },
  { command: 'heading-5', title: 'Heading 5', label: 'Heading 5', icon: Heading3 },
  { command: 'heading-6', title: 'Heading 6', label: 'Heading 6', icon: Heading3 },
]

const primaryHeadingToolbarCommands: VisualToolbarItem[] = [
  { command: 'heading-1', title: 'Heading 1', label: 'H1', icon: Heading1 },
  { command: 'heading-2', title: 'Heading 2', label: 'H2', icon: Heading2 },
  { command: 'heading-3', title: 'Subtitle', label: 'Subtitle', icon: Heading3 },
]

const visualToolbarGroups: Array<{
  name: string
  items: VisualToolbarItem[]
}> = [
  {
    name: 'Text',
    items: [
      { command: 'bold', title: 'Bold', label: 'Bold', icon: Bold },
      { command: 'italic', title: 'Italic', label: 'Italic', icon: Italic },
      { command: 'strike', title: 'Strikethrough', label: 'Strike', icon: Strikethrough },
      { command: 'inline-code', title: 'Inline code', label: 'Inline code', icon: Code },
      { command: 'clear-formatting', title: 'Clear formatting', label: 'Clear', icon: RemoveFormatting },
    ],
  },
  {
    name: 'Blocks',
    items: [
      { command: 'bullet-list', title: 'Bullet list', label: 'Bullets', icon: List },
      { command: 'ordered-list', title: 'Numbered list', label: 'Numbers', icon: ListOrdered },
      { command: 'quote', title: 'Quote block', label: 'Quote', icon: Quote },
      { command: 'code-block', title: 'Code block', label: 'Code block', icon: SquareCode },
      { command: 'horizontal-rule', title: 'Divider', label: 'Divider', icon: Minus },
    ],
  },
  {
    name: 'Insert',
    items: [
      { command: 'link', title: 'Link', label: 'Link', icon: LinkIcon },
      { command: 'image', title: 'Image', label: 'Image', icon: ImageIcon },
    ],
  },
]

function runToolbarMenuCommand(event: MouseEvent, command: VisualEditorCommand) {
  emit('runCommand', command)
  ;(event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')
  headingsMenuOpen.value = false
}
</script>

<template>
  <section class="shared-toolbar" aria-label="Document toolbar">
    <div class="format-toolbar shared-format-toolbar">
      <div class="toolbar-group" aria-label="Headings">
        <button
          v-for="item in primaryHeadingToolbarCommands"
          :key="item.command"
          type="button"
          class="toolbar-button"
          :title="item.title"
          :aria-label="item.title"
          @click="emit('runCommand', item.command)"
        >
          <component :is="item.icon" v-if="item.icon" :size="uiIconSizes.toolbar" />
          <span>{{ item.label }}</span>
        </button>
        <details
          class="toolbar-menu"
          data-close-on-outside
          @toggle="headingsMenuOpen = ($event.currentTarget as HTMLDetailsElement).open"
        >
          <summary
            class="toolbar-button toolbar-menu-trigger"
            title="Headings"
            aria-label="Headings"
            :aria-expanded="headingsMenuOpen"
          >
            <Heading1 :size="uiIconSizes.toolbar" />
            <span>Headings</span>
            <ChevronDown class="toolbar-menu-chevron" :size="uiIconSizes.toolbarChevron" />
          </summary>
          <div class="toolbar-menu-list">
            <button
              v-for="item in headingToolbarCommands"
              :key="item.command"
              type="button"
              class="toolbar-menu-item"
              :title="item.title"
              :aria-label="item.title"
              @click="runToolbarMenuCommand($event, item.command)"
            >
              <component :is="item.icon" v-if="item.icon" :size="uiIconSizes.toolbarMenuItem" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </details>
      </div>

      <template v-for="group in visualToolbarGroups" :key="group.name">
        <span class="toolbar-divider" aria-hidden="true" />
        <div class="toolbar-group" :aria-label="group.name">
          <button
            v-for="item in group.items"
            :key="item.command"
            type="button"
            class="toolbar-button"
            :title="item.title"
            :aria-label="item.title"
            @click="emit('runCommand', item.command)"
          >
            <component :is="item.icon" v-if="item.icon" :size="uiIconSizes.toolbar" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
