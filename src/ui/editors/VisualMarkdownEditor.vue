<script setup lang="ts">
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { Editor } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import PromptDialog from '../dialogs/PromptDialog.vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import type { EditorViewSession } from '../../domain/documents/editorSync'
import { toVisualSelectionState } from '../../domain/documents/editorViewState'
import { resolveVisualImageSource } from '../../domain/markdown/imageRendering'
import { validateLinkTarget } from '../../domain/markdown/markdownSafety'
import type { EditorCommand } from '../../application/types/shell'
import {
  buildDocumentMapLines,
  extractMarkdownHeadings,
  findActiveHeading,
} from '../../domain/markdown/outline'
import {
  createImageInputDialog,
  createLinkInputDialog,
  type EditorInputDialogState,
} from './editorInputDialogs'
import DocumentMap from '../navigation/DocumentMap.vue'
import DocumentOutline from '../navigation/DocumentOutline.vue'

const props = defineProps<{
  documentId: string
  viewId: string
  modelValue: string
  revision: number
  documentPath: string | null
  workspaceRootPath: string | null
  outlineWidth: number
  documentMapWidth: number
  showDocumentOutline: boolean
  showDocumentMap: boolean
  allowRemoteImages: boolean
  viewState: EditorViewSession
}>()

const emit = defineEmits<{
  'document-update': [update: DocumentUpdate]
  'toolbar-state': [state: { disabledCommands: EditorCommand[] }]
  'set-outline-width': [width: number]
  'set-document-map-width': [width: number]
}>()

const scrollHost = ref<HTMLDivElement | null>(null)
const editorHost = ref<HTMLDivElement | null>(null)
const mapViewport = ref({ top: 0, height: 100 })
const activeHeadingId = ref<string | null>(null)
const editor = shallowRef<Editor | null>(null)
const inputDialog = ref<EditorInputDialogState | null>(null)
const inputDialogError = ref<string | null>(null)
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false
let isRunningEditorCommand = false
let resolveInputDialog: ((value: string | null) => void) | null = null
let mapResizeObserver: ResizeObserver | null = null

const headings = computed(() => extractMarkdownHeadings(props.modelValue))
const showOutline = computed(() => props.showDocumentOutline && headings.value.length > 0)
const mapBlocks = computed(() => buildDocumentMapLines(props.modelValue))
const showDocumentMap = computed(() => props.showDocumentMap && mapBlocks.value.length > 0)

const structuralTableCommands: EditorCommand[] = [
  'add-row-before',
  'add-row-after',
  'delete-row',
  'add-column-before',
  'add-column-after',
  'delete-column',
  'delete-table',
]

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
        updateMapViewport()
      }
    })
  }

  nextTick(updateMapViewport)
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
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown,
    ],
    onCreate: () => {
      lastAppliedRevision = props.revision
      emitToolbarState()
    },
    onSelectionUpdate: () => emitToolbarState(),
    onUpdate: ({ editor }) => {
      emitToolbarState()

      if (isApplyingExternalContent) {
        return
      }

      if (!editor.isFocused && !isRunningEditorCommand) {
        lastAppliedRevision = props.revision
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

function emitToolbarState() {
  emit('toolbar-state', {
    disabledCommands: editor.value?.isActive('table') ? [] : structuralTableCommands,
  })
}

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/gu, '-')
}

function findAnchorTarget(hash: string) {
  let anchor = ''

  try {
    anchor = decodeURIComponent(hash.slice(1))
  } catch {
    anchor = hash.slice(1)
  }

  const root = editorHost.value

  if (!anchor || !root) {
    return null
  }

  const exactIdTarget = Array.from(root.querySelectorAll<HTMLElement>('[id]'))
    .find((element) => element.id === anchor)

  if (exactIdTarget) {
    return exactIdTarget
  }

  return Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
    .find((element) => slugifyHeading(element.textContent ?? '') === anchor)
    ?? null
}

function openVisualLink(href: string) {
  const validationError = validateLinkTarget(href)

  if (validationError) {
    return
  }

  if (href.startsWith('#')) {
    findAnchorTarget(href)?.scrollIntoView({ block: 'start' })
    return
  }

  if (/^https?:\/\//iu.test(href)) {
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}

function scrollToHeading(id: string) {
  findAnchorTarget(`#${encodeURIComponent(id)}`)?.scrollIntoView({ block: 'start' })
  requestAnimationFrame(updateMapViewport)
}

function updateMapViewport() {
  const scrollElement = scrollHost.value

  if (!scrollElement) {
    return
  }

  const scrollHeight = scrollElement.scrollHeight
  const clientHeight = scrollElement.clientHeight

  if (scrollHeight <= 0 || clientHeight <= 0 || scrollHeight <= clientHeight) {
    mapViewport.value = { top: 0, height: 100 }
    updateActiveHeading()
    return
  }

  const height = Math.max((clientHeight / scrollHeight) * 100, 8)
  const maxTop = 100 - height
  const top = Math.min((scrollElement.scrollTop / (scrollHeight - clientHeight)) * maxTop, maxTop)
  mapViewport.value = { top, height }
  updateActiveHeading()
}

function updateActiveHeading() {
  if (!scrollHost.value || !editorHost.value || headings.value.length === 0) {
    activeHeadingId.value = null
    return
  }

  const scrollElement = scrollHost.value
  const scrollRect = scrollElement.getBoundingClientRect()
  const positions = Object.fromEntries(headings.value.map((heading) => {
    const element = findAnchorTarget(`#${encodeURIComponent(heading.id)}`)
    const rect = element?.getBoundingClientRect()
    return [heading.id, rect ? rect.top - scrollRect.top + scrollElement.scrollTop : Number.POSITIVE_INFINITY]
  }))
  activeHeadingId.value = findActiveHeading(headings.value, positions, scrollElement.scrollTop)
}

function scrollMapToRatio(ratio: number) {
  if (!scrollHost.value) {
    return
  }

  scrollHost.value.scrollTop = ratio * (scrollHost.value.scrollHeight - scrollHost.value.clientHeight)
  updateMapViewport()
}

function handleVisualClick(event: MouseEvent) {
  const link = (event.target as HTMLElement | null)?.closest('a[href]')

  if (!(link instanceof HTMLAnchorElement)) {
    return
  }

  const href = link.getAttribute('href') ?? ''

  if (!href.startsWith('#') && !event.ctrlKey && !event.metaKey) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  openVisualLink(href)
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
  restoreViewState(props.viewState)
  scrollHost.value?.addEventListener('scroll', updateMapViewport)
  if (scrollHost.value) {
    mapResizeObserver = new ResizeObserver(updateMapViewport)
    mapResizeObserver.observe(scrollHost.value)
  }
  nextTick(updateMapViewport)
})

function flushContent() {
  const nextContent = editor.value?.getMarkdown() ?? props.modelValue

  if (isVisuallyEquivalentMarkdown(nextContent, props.modelValue)) {
    return props.modelValue
  }

  return nextContent
}

defineExpose({
  captureViewState,
  flushContent,
  restoreViewState,
  runCommand: runEditorCommand,
})

function runCommand(command: () => void) {
  if (!editor.value) {
    return
  }

  isRunningEditorCommand = true
  try {
    command()
    editor.value.commands.focus()
  } finally {
    isRunningEditorCommand = false
  }
}

function openInputDialog(options: EditorInputDialogState) {
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
  const url = await openInputDialog(createLinkInputDialog(previousUrl ?? ''))

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

  const url = await openInputDialog(createImageInputDialog())

  if (!url) {
    return
  }

  runCommand(() => editor.value?.chain().focus().setImage({ src: url }).run())
}

function captureViewState() {
  const selection = editor.value?.state.selection

  return {
    scrollTop: scrollHost.value?.scrollTop ?? props.viewState.scrollTop,
    selectionState: selection
      ? {
          kind: 'visual',
          from: selection.from,
          to: selection.to,
        }
      : props.viewState.selectionState,
    isFocused: editor.value?.isFocused ?? false,
  }
}

function restoreViewState(viewState: Pick<EditorViewSession, 'scrollTop' | 'selectionState' | 'isFocused'>) {
  if (editor.value) {
    const nextMaxPosition = editor.value.state.doc.content.size
    const selection = toVisualSelectionState(viewState.selectionState, nextMaxPosition)

    if (selection) {
      editor.value.commands.setTextSelection({ from: selection.from, to: selection.to })
    }
  }

  requestAnimationFrame(() => {
    if (scrollHost.value) {
      scrollHost.value.scrollTop = viewState.scrollTop
      updateMapViewport()
    }

    if (viewState.isFocused) {
      editor.value?.commands.focus()
    }
  })
}

function runEditorCommand(command: EditorCommand) {
  const commands: Record<EditorCommand, () => void | Promise<void>> = {
    'heading-1': () => runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 1 }).run()),
    'heading-2': () => runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 2 }).run()),
    'heading-3': () => runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 3 }).run()),
    'heading-4': () => runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 4 }).run()),
    'heading-5': () => runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 5 }).run()),
    'heading-6': () => runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 6 }).run()),
    bold: () => runCommand(() => editor.value?.chain().focus().toggleBold().run()),
    italic: () => runCommand(() => editor.value?.chain().focus().toggleItalic().run()),
    strike: () => runCommand(() => editor.value?.chain().focus().toggleStrike().run()),
    'inline-code': () => runCommand(() => editor.value?.chain().focus().toggleCode().run()),
    'clear-formatting': () => runCommand(() => editor.value?.chain().focus().unsetAllMarks().clearNodes().run()),
    'bullet-list': () => runCommand(() => editor.value?.chain().focus().toggleBulletList().run()),
    'ordered-list': () => runCommand(() => editor.value?.chain().focus().toggleOrderedList().run()),
    'task-list': () => runCommand(() => (editor.value?.chain().focus() as unknown as {
      toggleTaskList: () => { run: () => boolean }
    }).toggleTaskList().run()),
    quote: () => runCommand(() => editor.value?.chain().focus().toggleBlockquote().run()),
    'code-block': () => runCommand(() => editor.value?.chain().focus().toggleCodeBlock().run()),
    link: () => setLink(),
    image: () => setImage(),
    'horizontal-rule': () => runCommand(() => editor.value?.chain().focus().setHorizontalRule().run()),
    'insert-table': () => runTableCommand((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    'add-row-before': () => runTableCommand((chain) => chain.addRowBefore().run()),
    'add-row-after': () => runTableCommand((chain) => chain.addRowAfter().run()),
    'delete-row': () => runTableCommand((chain) => chain.deleteRow().run()),
    'add-column-before': () => runTableCommand((chain) => chain.addColumnBefore().run()),
    'add-column-after': () => runTableCommand((chain) => chain.addColumnAfter().run()),
    'delete-column': () => runTableCommand((chain) => chain.deleteColumn().run()),
    'delete-table': () => runTableCommand((chain) => chain.deleteTable().run()),
  }

  void commands[command]()
}

type TableCommandChain = {
  insertTable: (options: { rows: number, cols: number, withHeaderRow: boolean }) => { run: () => boolean }
  addRowBefore: () => { run: () => boolean }
  addRowAfter: () => { run: () => boolean }
  deleteRow: () => { run: () => boolean }
  addColumnBefore: () => { run: () => boolean }
  addColumnAfter: () => { run: () => boolean }
  deleteColumn: () => { run: () => boolean }
  deleteTable: () => { run: () => boolean }
}

function runTableCommand(command: (chain: TableCommandChain) => boolean) {
  runCommand(() => {
    const chain = editor.value?.chain().focus() as unknown as TableCommandChain | undefined

    if (chain) {
      command(chain)
    }
  })
}

onBeforeUnmount(() => {
  scrollHost.value?.removeEventListener('scroll', updateMapViewport)
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
  editor.value?.destroy()
  editor.value = null
  resolveInputDialog?.(null)
  resolveInputDialog = null
})
</script>

<template>
  <div
    class="editor-navigation-frame"
    :style="{
      '--outline-width': `${outlineWidth}px`,
      '--document-map-width': `${documentMapWidth}px`,
    }"
  >
    <DocumentOutline
      v-if="showOutline"
      :headings="headings"
      :active-heading-id="activeHeadingId"
      :width="outlineWidth"
      @select="scrollToHeading($event.id)"
      @resize="emit('set-outline-width', $event)"
    />

    <div class="visual-editor" data-testid="visual-editor">
      <div ref="scrollHost" class="visual-editor-scroll">
        <div ref="editorHost" class="visual-editor-content" @click.capture="handleVisualClick" />
      </div>
    </div>

    <DocumentMap
      v-if="showDocumentMap"
      :lines="mapBlocks"
      :viewport="mapViewport"
      :width="documentMapWidth"
      @navigate="scrollMapToRatio"
      @resize="emit('set-document-map-width', $event)"
    />

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
