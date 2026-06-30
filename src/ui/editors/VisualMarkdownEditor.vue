<script setup lang="ts">
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { Editor } from '@tiptap/vue-3'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
} from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import PromptDialog from '../dialogs/PromptDialog.vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import { resolveVisualImageSource } from '../../domain/markdown/imageRendering'
import { validateImageTarget, validateLinkTarget } from '../../domain/markdown/markdownSafety'

const props = defineProps<{
  documentId: string
  viewId: string
  modelValue: string
  revision: number
  documentPath: string | null
  workspaceRootPath: string | null
  allowRemoteImages: boolean
}>()

const emit = defineEmits<{
  'document-update': [update: DocumentUpdate]
}>()

type InputDialogState = {
  title: string
  message: string
  initialValue: string
  placeholder: string
  confirmLabel: string
  inputLabel: string
  validate?: (value: string) => string | null
  normalize?: (value: string) => string
}

const scrollHost = ref<HTMLDivElement | null>(null)
const editorHost = ref<HTMLDivElement | null>(null)
const editor = shallowRef<Editor | null>(null)
const inputDialog = ref<InputDialogState | null>(null)
const inputDialogError = ref<string | null>(null)
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false
let resolveInputDialog: ((value: string | null) => void) | null = null

function normalizeVisualMarkdownForComparison(value: string) {
  return value.replace(/\r\n?/g, '\n').trimEnd()
}

function isVisuallyEquivalentMarkdown(firstValue: string, secondValue: string) {
  return normalizeVisualMarkdownForComparison(firstValue) === normalizeVisualMarkdownForComparison(secondValue)
}

function applyExternalContent(value: string, revision: number, preserveViewState: boolean) {
  if (!editor.value) {
    return
  }

  const scrollTop = scrollHost.value?.scrollTop ?? 0
  const selection = editor.value.state.selection
  isApplyingExternalContent = true

  try {
    editor.value.commands.setContent(value, {
      contentType: 'markdown',
      emitUpdate: false,
    })
    const nextMaxPosition = editor.value.state.doc.content.size
    if (nextMaxPosition > 0) {
      const from = Math.max(1, Math.min(selection.from, nextMaxPosition))
      const to = Math.max(1, Math.min(selection.to, nextMaxPosition))
      editor.value.commands.setTextSelection({ from, to })
    }
    lastAppliedRevision = revision
  } finally {
    isApplyingExternalContent = false
  }

  if (preserveViewState) {
    requestAnimationFrame(() => {
      if (scrollHost.value) {
        scrollHost.value.scrollTop = scrollTop
      }
    })
  }
}

function createImageNodeView(
  source: string | null,
  allowRemoteImages: boolean,
  documentPath: string | null,
  workspaceRootPath: string | null,
) {
  return () => {
    const dom = document.createElement('div')
    dom.className = 'visual-image-node'
    dom.contentEditable = 'false'

    function renderImage() {
      const resolvedImage = resolveVisualImageSource({
        source,
        documentPath,
        workspaceRootPath,
        allowRemoteImages,
      })

      dom.replaceChildren()

      if (resolvedImage.kind === 'placeholder') {
        dom.dataset.imageState = 'placeholder'

        const placeholder = document.createElement('div')
        placeholder.className = 'visual-image-placeholder'

        const title = document.createElement('strong')
        title.textContent = 'Image preview unavailable'
        placeholder.append(title)

        const message = document.createElement('span')
        message.textContent = resolvedImage.reason
        placeholder.append(message)

        if (source?.trim()) {
          const details = document.createElement('code')
          details.textContent = source.trim()
          placeholder.append(details)
        }

        dom.append(placeholder)
        return
      }

      dom.dataset.imageState = 'loaded'

      const image = document.createElement('img')
      image.src = resolvedImage.renderedSrc
      image.alt = ''
      image.loading = 'lazy'

      image.addEventListener('error', () => {
        dom.dataset.imageState = 'error'
        dom.replaceChildren()

        const placeholder = document.createElement('div')
        placeholder.className = 'visual-image-placeholder visual-image-placeholder-error'

        const title = document.createElement('strong')
        title.textContent = 'Image could not be loaded'
        placeholder.append(title)

        const message = document.createElement('span')
        message.textContent = source?.trim()
          ? `Folden kept the Markdown unchanged, but the preview failed for ${source.trim()}.`
          : 'Folden kept the Markdown unchanged, but the preview failed.'
        placeholder.append(message)

        dom.append(placeholder)
      }, { once: true })

      dom.append(image)
    }

    renderImage()

    return {
      dom,
      update: (updatedNode: { attrs?: { src?: string | null } }) => {
        if (updatedNode.attrs?.src !== source) {
          return false
        }

        return true
      },
    }
  }
}

function createEditor(element: HTMLDivElement) {
  const VisualImage = Image.extend({
    addNodeView() {
      return ({ node }) => createImageNodeView(
        node.attrs.src as string | null,
        props.allowRemoteImages,
        props.documentPath,
        props.workspaceRootPath,
      )()
    },
  })

  return new Editor({
    element,
    content: props.modelValue,
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      VisualImage.configure({
        inline: false,
        allowBase64: false,
      }),
      Markdown,
    ],
    onCreate: () => {
      lastAppliedRevision = props.revision
    },
    onUpdate: ({ editor }) => {
      if (isApplyingExternalContent) {
        return
      }

      const nextContent = editor.getMarkdown()

      if (isVisuallyEquivalentMarkdown(nextContent, props.modelValue)) {
        lastAppliedRevision = props.revision
        return
      }

      emit('document-update', {
        documentId: props.documentId,
        originViewId: props.viewId,
        baseRevision: lastAppliedRevision,
        nextContent,
        updateKind: 'visual-edit',
      })
      lastAppliedRevision += 1
    },
  })
}

watch(
  () => [props.documentId, props.modelValue, props.revision] as const,
  ([documentId, value, revision], [previousDocumentId]) => {
    if (!editor.value) {
      return
    }

    const isDocumentSwitch = documentId !== previousDocumentId

    if (!isDocumentSwitch && isVisuallyEquivalentMarkdown(editor.value.getMarkdown(), value)) {
      lastAppliedRevision = revision
      return
    }

    applyExternalContent(value, revision, !isDocumentSwitch)
  },
)

onMounted(() => {
  if (!editorHost.value) {
    return
  }

  editor.value = createEditor(editorHost.value)
})

function flushContent() {
  const nextContent = editor.value?.getMarkdown() ?? props.modelValue

  if (isVisuallyEquivalentMarkdown(nextContent, props.modelValue)) {
    return props.modelValue
  }

  return nextContent
}

defineExpose({
  flushContent,
})

function runCommand(command: () => void) {
  if (!editor.value) {
    return
  }

  command()
  editor.value.commands.focus()
}

function openInputDialog(options: InputDialogState) {
  inputDialogError.value = null
  inputDialog.value = options

  return new Promise<string | null>((resolve) => {
    resolveInputDialog = resolve
  })
}

function submitInputDialog(value: string) {
  const currentDialog = inputDialog.value

  if (!currentDialog) {
    return
  }

  const validationError = currentDialog.validate?.(value) ?? null

  if (validationError) {
    inputDialogError.value = validationError
    return
  }

  const resolve = resolveInputDialog
  inputDialogError.value = null
  inputDialog.value = null
  resolveInputDialog = null
  resolve?.(currentDialog.normalize ? currentDialog.normalize(value) : value)
}

function cancelInputDialog() {
  const resolve = resolveInputDialog
  inputDialogError.value = null
  inputDialog.value = null
  resolveInputDialog = null
  resolve?.(null)
}

async function setLink() {
  if (!editor.value) {
    return
  }

  const previousUrl = editor.value.getAttributes('link').href as string | undefined
  const url = await openInputDialog({
    title: 'Edit link',
    message: 'Enter a URL for the selected link. Leave it empty to remove the link.',
    initialValue: previousUrl ?? '',
    placeholder: 'https://example.com',
    confirmLabel: 'Apply',
    inputLabel: 'Link URL',
    validate: (value) => validateLinkTarget(value),
    normalize: (value) => value.trim(),
  })

  if (url === null) {
    return
  }

  if (url.trim() === '') {
    runCommand(() => editor.value?.chain().focus().extendMarkRange('link').unsetLink().run())
    return
  }

  runCommand(() =>
    editor.value
      ?.chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim() })
      .run(),
  )
}

async function setImage() {
  if (!editor.value) {
    return
  }

  const url = await openInputDialog({
    title: 'Insert image',
    message: 'Enter a relative, asset:, data:, http:, or https: image URL to insert into the document.',
    initialValue: '',
    placeholder: './image.png',
    confirmLabel: 'Insert',
    inputLabel: 'Image URL',
    validate: (value) => validateImageTarget(value),
    normalize: (value) => value.trim(),
  })

  if (!url) {
    return
  }

  runCommand(() => editor.value?.chain().focus().setImage({ src: url }).run())
}

onBeforeUnmount(() => {
  editor.value?.destroy()
  editor.value = null
  resolveInputDialog?.(null)
  resolveInputDialog = null
})
</script>

<template>
  <div class="visual-editor" data-testid="visual-editor">
    <div v-if="editor" class="format-toolbar" aria-label="Markdown formatting">
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('heading', { level: 1 }) }"
        title="Heading 1"
        @click="runCommand(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())"
      >
        <Heading1 :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('heading', { level: 2 }) }"
        title="Heading 2"
        @click="runCommand(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())"
      >
        <Heading2 :size="16" />
      </button>
      <span class="toolbar-divider" />
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('bold') }"
        title="Bold"
        @click="runCommand(() => editor?.chain().focus().toggleBold().run())"
      >
        <Bold :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('italic') }"
        title="Italic"
        @click="runCommand(() => editor?.chain().focus().toggleItalic().run())"
      >
        <Italic :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('strike') }"
        title="Strike"
        @click="runCommand(() => editor?.chain().focus().toggleStrike().run())"
      >
        <Strikethrough :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('code') }"
        title="Inline code"
        @click="runCommand(() => editor?.chain().focus().toggleCode().run())"
      >
        <Code :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        title="Clear formatting"
        @click="runCommand(() => editor?.chain().focus().unsetAllMarks().clearNodes().run())"
      >
        <RemoveFormatting :size="16" />
      </button>
      <span class="toolbar-divider" />
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('bulletList') }"
        title="Bullet list"
        @click="runCommand(() => editor?.chain().focus().toggleBulletList().run())"
      >
        <List :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('orderedList') }"
        title="Ordered list"
        @click="runCommand(() => editor?.chain().focus().toggleOrderedList().run())"
      >
        <ListOrdered :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('blockquote') }"
        title="Quote"
        @click="runCommand(() => editor?.chain().focus().toggleBlockquote().run())"
      >
        <Quote :size="16" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: editor.isActive('codeBlock') }"
        title="Code block"
        @click="runCommand(() => editor?.chain().focus().toggleCodeBlock().run())"
      >
        <Code :size="16" />
      </button>
      <span class="toolbar-divider" />
      <button type="button" class="icon-button" title="Link" @click="setLink">
        <LinkIcon :size="16" />
      </button>
      <button type="button" class="icon-button" title="Image" @click="setImage">
        <ImageIcon :size="16" />
      </button>
      <button
        type="button"
        class="toolbar-button"
        title="Horizontal rule"
        @click="runCommand(() => editor?.chain().focus().setHorizontalRule().run())"
      >
        HR
      </button>
    </div>

    <div ref="scrollHost" class="visual-editor-scroll">
      <div ref="editorHost" class="visual-editor-content" />
    </div>

    <PromptDialog
      :open="!!inputDialog"
      :title="inputDialog?.title ?? ''"
      :message="inputDialog?.message ?? ''"
      :initial-value="inputDialog?.initialValue ?? ''"
      :placeholder="inputDialog?.placeholder ?? ''"
      :confirm-label="inputDialog?.confirmLabel ?? 'Save'"
      :input-label="inputDialog?.inputLabel ?? 'Value'"
      :error="inputDialogError"
      @submit="submitInputDialog"
      @cancel="cancelInputDialog"
    />
  </div>
</template>
