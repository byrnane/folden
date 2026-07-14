<script setup lang="ts">
import Image from '@tiptap/extension-image'
import { Extension, type Editor as CoreEditor } from '@tiptap/core'
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
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  Copy,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Trash2,
  Type,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import PromptDialog from '../dialogs/PromptDialog.vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import { createDocumentPatch } from '../../domain/documents/documentPatch'
import type { EditorViewSession } from '../../domain/documents/editorSync'
import { toVisualSelectionState } from '../../domain/documents/editorViewState'
import { resolveVisualImageSource } from '../../domain/markdown/imageRendering'
import { convertVisualImagePath } from '../../infrastructure/tauri/visualImageAssets'
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
import {
  parseMarkdownBlockDocument,
  type MarkdownBlockDocument,
} from '../../domain/markdown/blockDocument'
import type { LogicalSelectionAnchor } from '../../domain/markdown/blockDocument'
import { RawMarkdownBlock } from './rawMarkdownBlock'
import { buildVisualMarkdownProjection } from './visualProjection'

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
  blockDocument: MarkdownBlockDocument | null
}>()

const emit = defineEmits<{
  'document-update': [update: DocumentUpdate]
  'history-command': [command: 'undo' | 'redo']
  'toolbar-state': [state: { disabledCommands: EditorCommand[] }]
  'set-outline-width': [width: number]
  'set-document-map-width': [width: number]
}>()

const scrollHost = ref<HTMLDivElement | null>(null)
const editorHost = ref<HTMLDivElement | null>(null)
const slashMenuElement = ref<HTMLDivElement | null>(null)
const blockMenuElement = ref<HTMLDivElement | null>(null)
const mapViewport = ref({ top: 0, height: 100 })
const mapLinePositions = ref<Record<number, number>>({})
const activeHeadingId = ref<string | null>(null)
const editor = shallowRef<Editor | null>(null)
const inputDialog = ref<EditorInputDialogState | null>(null)
const inputDialogError = ref<string | null>(null)
const activeBlockIndex = ref<number | null>(null)
const selectedBlockIndices = ref<number[]>([])
const blockMenuOpen = ref(false)
const blockTransformMenuOpen = ref(false)
const blockMenuPosition = ref({ top: 0, left: 0 })
const isBlockDragging = ref(false)
const dropBlockIndex = ref<number | null>(null)
const slashMenu = ref<{ query: string; selected: number; top: number; left: number } | null>(null)
const contextMenuPosition = ref<{ top: number; left: number } | null>(null)
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false
let resolveInputDialog: ((value: string | null) => void) | null = null
let mapResizeObserver: ResizeObserver | null = null
let blockDragGhost: HTMLDivElement | null = null
let blockSelectionPinned = false
let blockAutoScrollFrame: number | null = null
let pointerCaptureElement: HTMLElement | null = null
let pointerDrag: {
  pointerId: number
  startX: number
  startY: number
  clientX: number
  clientY: number
} | null = null
let pendingBlockClickSelection: { activeIndex: number; indices: number[] } | null = null
type VisualNodeSnapshot = {
  blockId: string
  nodes: ProseMirrorNode[]
  rawSource: string
}

let visualNodeSnapshots: VisualNodeSnapshot[] = []
let lastVisualMarkdown = props.modelValue
let hasVisualChanges = false
let visualOperationGroup: string | null = null
let visualOperationSequence = 0
let allowUnfocusedVisualUpdate = false
let acceptVisualUpdates = false
let forcedVisualMarkdown: string | null = null
const blockControlsPluginKey = new PluginKey('foldenBlockControls')

function beginVisualOperation(kind: string) {
  const group = `visual-${kind}-${visualOperationSequence++}`
  visualOperationGroup = group
  allowUnfocusedVisualUpdate = true
  queueMicrotask(() => {
    if (visualOperationGroup === group) visualOperationGroup = null
  })
}

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
  return (
    normalizeVisualMarkdownForComparison(firstValue) ===
    normalizeVisualMarkdownForComparison(secondValue)
  )
}

function trailingBlockWhitespace(value: string) {
  return /(?:\r?\n[\t ]*)+$/u.exec(value)?.[0] ?? '\n\n'
}

function snapshotVisualNodes(currentEditor: CoreEditor, source: string) {
  const blocks =
    props.blockDocument?.source === source
      ? props.blockDocument.blocks
      : parseMarkdownBlockDocument(source, props.blockDocument ?? undefined).blocks
  let nodeIndex = 0
  visualNodeSnapshots = blocks.map((block) => {
    const projection = buildVisualMarkdownProjection(block.rawSource, {
      source: block.rawSource,
      blocks: [block],
    })
    const parsedNodeCount =
      currentEditor.storage.markdown.manager.parse(projection.trimEnd()).content?.length ?? 0
    const nodeCount = Math.max(parsedNodeCount, 1)
    const nodes: ProseMirrorNode[] = []
    for (
      let offset = 0;
      offset < nodeCount && nodeIndex < currentEditor.state.doc.childCount;
      offset += 1
    ) {
      nodes.push(currentEditor.state.doc.child(nodeIndex++))
    }
    return {
      blockId: block.id,
      nodes,
      rawSource: block.rawSource,
    }
  })

  while (nodeIndex < currentEditor.state.doc.childCount) {
    visualNodeSnapshots.push({
      blockId: `visual-node-${nodeIndex}`,
      nodes: [currentEditor.state.doc.child(nodeIndex)],
      rawSource: '',
    })
    nodeIndex += 1
  }
}

function serializeVisualDocumentLosslessly(
  currentEditor: CoreEditor,
  currentNodes = Array.from({ length: currentEditor.state.doc.childCount }, (_, index) =>
    currentEditor.state.doc.child(index),
  ),
) {
  const snapshotPositions = new Map<number, { snapshot: VisualNodeSnapshot; isLast: boolean }>()
  let snapshotPosition = 0
  for (const snapshot of visualNodeSnapshots) {
    snapshot.nodes.forEach((_, offset) => {
      snapshotPositions.set(snapshotPosition + offset, {
        snapshot,
        isLast: offset === snapshot.nodes.length - 1,
      })
    })
    snapshotPosition += snapshot.nodes.length
  }

  const rendered: string[] = []
  for (let index = 0; index < currentNodes.length;) {
    const reusable = visualNodeSnapshots.find(
      (snapshot) =>
        snapshot.nodes[0] === currentNodes[index] &&
        snapshot.nodes.every(
          (node, offset) =>
            node === currentNodes[index + offset] && currentNodes[index + offset]?.eq(node),
        ),
    )
    if (reusable) {
      rendered.push(reusable.rawSource)
      index += reusable.nodes.length
      continue
    }

    const node = currentNodes[index]
    const positional = snapshotPositions.get(index)
    const serialized = currentEditor.storage.markdown.manager.serialize({
      type: 'doc',
      content: [node.toJSON()],
    })
    const whitespace = positional
      ? positional.isLast
        ? trailingBlockWhitespace(positional.snapshot.rawSource)
        : ''
      : '\n\n'
    rendered.push(`${serialized.trimEnd()}${whitespace}`)
    index += 1
  }
  return rendered
    .join('')
    .replace(/\n\n$/u, (ending) =>
      lastVisualMarkdown.endsWith('\n\n') ? ending : lastVisualMarkdown.endsWith('\n') ? '\n' : '',
    )
}

function commitVisualContent(currentEditor: CoreEditor, nextContent: string) {
  if (isVisuallyEquivalentMarkdown(nextContent, lastVisualMarkdown)) return
  const patch = createDocumentPatch(lastVisualMarkdown, nextContent)
  if (!patch) return
  emit('document-update', {
    documentId: props.documentId,
    originViewId: props.viewId,
    baseRevision: lastAppliedRevision,
    patches: [patch],
    updateKind: 'visual-edit',
    historyGroup: visualOperationGroup ?? 'visual-edit',
  })
  lastAppliedRevision += 1
  lastVisualMarkdown = nextContent
  hasVisualChanges = true
  snapshotVisualNodes(currentEditor, nextContent)
}

function reparseRawBlock(rawSource: string, position: number) {
  if (!editor.value) return
  const parsedDocument = parseMarkdownBlockDocument(rawSource)
  if (parsedDocument.blocks.length !== 1 || parsedDocument.blocks[0].kind === 'raw') return
  const currentNode = editor.value.state.doc.nodeAt(position)
  const parsedContent = editor.value.storage.markdown.manager.parse(rawSource).content ?? []
  if (!currentNode || !parsedContent.length) return
  const nodes = parsedContent.map((content) => editor.value!.schema.nodeFromJSON(content))
  beginVisualOperation('raw-collapse')
  editor.value.view.dispatch(
    editor.value.state.tr.replaceWith(
      position,
      position + currentNode.nodeSize,
      Fragment.fromArray(nodes),
    ),
  )
}

function applyExternalContent(value: string, revision: number, preserveViewState: boolean) {
  if (!editor.value) {
    return
  }

  const scrollTop = scrollHost.value?.scrollTop ?? 0
  const selection = editor.value.state.selection
  isApplyingExternalContent = true
  acceptVisualUpdates = false

  try {
    editor.value.commands.setContent(buildVisualMarkdownProjection(value, props.blockDocument), {
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
    lastVisualMarkdown = value
    hasVisualChanges = false
    snapshotVisualNodes(editor.value, value)
  } finally {
    isApplyingExternalContent = false
    requestAnimationFrame(() => {
      acceptVisualUpdates = true
    })
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
    const dom = document.createElement('div') as HTMLDivElement & {
      renderWithPermission?: (allowed: boolean) => void
    }
    dom.className = 'visual-image-node'
    dom.contentEditable = 'false'
    dom.dataset.imageSource = source ?? ''
    let remoteImagesAllowed = allowRemoteImages

    function renderImage() {
      const resolvedImage = resolveVisualImageSource(
        {
          source,
          documentPath,
          workspaceRootPath,
          allowRemoteImages: remoteImagesAllowed,
        },
        convertVisualImagePath,
      )

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

      image.addEventListener(
        'error',
        () => {
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
        },
        { once: true },
      )

      dom.append(image)
    }

    dom.renderWithPermission = (allowed) => {
      remoteImagesAllowed = allowed
      renderImage()
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
      return ({ node }) =>
        createImageNodeView(
          node.attrs.src as string | null,
          props.allowRemoteImages,
          props.documentPath,
          props.workspaceRootPath,
        )()
    },
  })

  const BlockControls = Extension.create({
    name: 'foldenBlockControls',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: blockControlsPluginKey,
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = []
              state.doc.forEach((node, offset, index) => {
                const selected = selectedBlockIndices.value.includes(index)
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: `visual-block-node${selected ? ' visual-block-selected' : ''}`,
                    'data-block-index': String(index),
                  }),
                  Decoration.widget(offset, () => createBlockControls(index), {
                    key: `block-controls-${index}`,
                    side: -1,
                    ignoreSelection: true,
                  }),
                )
              })
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
      ]
    },
  })

  return new Editor({
    element,
    content: buildVisualMarkdownProjection(props.modelValue, props.blockDocument),
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
      RawMarkdownBlock.configure({
        onEdit: () => beginVisualOperation('raw'),
        onCollapse: reparseRawBlock,
      }),
      BlockControls,
      Markdown,
    ],
    editorProps: {
      handleKeyDown: (_view, event) => handleVisualKeydown(event),
    },
    onCreate: () => {
      lastAppliedRevision = props.revision
      lastVisualMarkdown = props.modelValue
      hasVisualChanges = false
      if (editor.value) snapshotVisualNodes(editor.value, props.modelValue)
      emitToolbarState()
    },
    onSelectionUpdate: ({ editor }) => {
      if (!(editor.state.selection instanceof NodeSelection) && !blockMenuOpen.value) {
        activateBlock(editor.state.selection.$from.index(0))
      }
      emitToolbarState()
      updateContextMenu()
      updateSlashMenu()
    },
    onUpdate: ({ editor }) => {
      if (!(editor.state.selection instanceof NodeSelection) && !blockMenuOpen.value) {
        activateBlock(editor.state.selection.$from.index(0))
      }
      emitToolbarState()
      updateContextMenu()
      updateSlashMenu()

      if (isApplyingExternalContent) {
        return
      }

      if (!acceptVisualUpdates) return

      if (!editor.isFocused && !allowUnfocusedVisualUpdate) {
        return
      }
      allowUnfocusedVisualUpdate = false

      const nextContent = forcedVisualMarkdown ?? serializeVisualDocumentLosslessly(editor)
      forcedVisualMarkdown = null
      commitVisualContent(editor, nextContent)
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

  const exactIdTarget = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(
    (element) => element.id === anchor,
  )

  if (exactIdTarget) {
    return exactIdTarget
  }

  return (
    Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).find(
      (element) => slugifyHeading(element.textContent ?? '') === anchor,
    ) ?? null
  )
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

  mapLinePositions.value = Object.fromEntries(
    headings.value.map((heading) => {
      const element = findAnchorTarget(`#${encodeURIComponent(heading.id)}`)
      const rect = element?.getBoundingClientRect()
      const position = rect
        ? rect.top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop
        : 0
      return [heading.line - 1, Math.min(Math.max((position / scrollHeight) * 100, 0), 100)]
    }),
  )

  if (scrollHeight <= 0 || clientHeight <= 0 || scrollHeight <= clientHeight) {
    mapViewport.value = { top: 0, height: 100 }
    updateActiveHeading()
    return
  }

  const height = (clientHeight / scrollHeight) * 100
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
  const positions = Object.fromEntries(
    headings.value.map((heading) => {
      const element = findAnchorTarget(`#${encodeURIComponent(heading.id)}`)
      const rect = element?.getBoundingClientRect()
      return [
        heading.id,
        rect ? rect.top - scrollRect.top + scrollElement.scrollTop : Number.POSITIVE_INFINITY,
      ]
    }),
  )
  activeHeadingId.value = findActiveHeading(headings.value, positions, scrollElement.scrollTop)
}

function scrollMapToRatio(ratio: number) {
  if (!scrollHost.value) {
    return
  }

  scrollHost.value.scrollTop =
    ratio * (scrollHost.value.scrollHeight - scrollHost.value.clientHeight)
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

function topLevelElements() {
  return editor.value
    ? Array.from(editor.value.view.dom.querySelectorAll<HTMLElement>(':scope > .visual-block-node'))
    : []
}

function positionBeforeBlock(index: number) {
  if (!editor.value) return 0
  let position = 0
  for (let current = 0; current < index; current += 1) {
    position += editor.value.state.doc.child(current).nodeSize
  }
  return position
}

function syncBlockDecorations() {
  if (!editor.value) return
  editor.value.view.dispatch(
    editor.value.state.tr.setMeta(blockControlsPluginKey, true).setMeta('addToHistory', false),
  )
}

function activateBlock(index: number) {
  if (!editor.value || index < 0 || index >= editor.value.state.doc.childCount) return
  blockSelectionPinned = false
  activeBlockIndex.value = index
  if (selectedBlockIndices.value.length === 1 && selectedBlockIndices.value[0] === index) return
  selectedBlockIndices.value = [index]
  syncBlockDecorations()
}

function clearBlockSelection() {
  blockSelectionPinned = false
  if (!selectedBlockIndices.value.length) return
  selectedBlockIndices.value = []
  syncBlockDecorations()
}

function closeBlockMenu() {
  blockMenuOpen.value = false
  blockTransformMenuOpen.value = false
  blockSelectionPinned = false
  updateContextMenu()
}

function clampBlockMenuToViewport() {
  const menu = blockMenuElement.value
  if (!menu) return
  const rect = menu.getBoundingClientRect()
  blockMenuPosition.value = {
    top: Math.max(12, Math.min(blockMenuPosition.value.top, window.innerHeight - rect.height - 12)),
    left: Math.max(12, Math.min(blockMenuPosition.value.left, window.innerWidth - rect.width - 12)),
  }
}

function openBlockTransformMenu() {
  blockTransformMenuOpen.value = true
  nextTick(clampBlockMenuToViewport)
}

function toggleBlockMenu(index: number, anchor: HTMLElement) {
  if (blockMenuOpen.value) {
    closeBlockMenu()
    return
  }
  selectBlock(index)
  const anchorRect = anchor.getBoundingClientRect()
  blockMenuPosition.value = {
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
  }
  blockMenuOpen.value = true
  blockTransformMenuOpen.value = false
  contextMenuPosition.value = null
  nextTick(() => {
    clampBlockMenuToViewport()
  })
}

function createBlockControls(index: number) {
  const controls = document.createElement('div')
  controls.className = 'visual-block-controls'
  controls.contentEditable = 'false'
  controls.dataset.blockIndex = String(index)

  const menuButton = document.createElement('button')
  menuButton.type = 'button'
  menuButton.className = 'visual-block-control visual-block-menu-trigger'
  menuButton.setAttribute('aria-label', 'Block menu')
  menuButton.dataset.testid = 'visual-block-menu-trigger'
  menuButton.innerHTML = '<span class="visual-block-menu-icon" aria-hidden="true">•••</span>'
  menuButton.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  menuButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleBlockMenu(index, menuButton)
  })

  const dragButton = document.createElement('button')
  dragButton.type = 'button'
  dragButton.className = 'visual-block-control visual-block-handle'
  dragButton.setAttribute('aria-label', 'Block actions')
  dragButton.dataset.testid = 'visual-block-handle'
  dragButton.innerHTML = '<span class="visual-block-grip-icon" aria-hidden="true"></span>'
  dragButton.addEventListener('pointerdown', (event) => prepareBlockDrag(event, index))
  dragButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handleBlockHandleClick()
  })

  controls.append(menuButton, dragButton)
  return controls
}

function selectBlock(index: number, extend = false) {
  if (!editor.value || index < 0 || index >= editor.value.state.doc.childCount) return
  if (extend && selectedBlockIndices.value.length) {
    const anchor = selectedBlockIndices.value[0]
    const from = Math.min(anchor, index)
    const to = Math.max(anchor, index)
    selectedBlockIndices.value = Array.from({ length: to - from + 1 }, (_, offset) => from + offset)
  } else {
    selectedBlockIndices.value = [index]
  }
  blockSelectionPinned = true
  activeBlockIndex.value = index
  editor.value.view.dispatch(
    editor.value.state.tr.setSelection(
      NodeSelection.create(editor.value.state.doc, positionBeforeBlock(index)),
    ),
  )
  syncBlockDecorations()
}

function selectedIndices() {
  if (selectedBlockIndices.value.length)
    return [...selectedBlockIndices.value].sort((a, b) => a - b)
  return activeBlockIndex.value === null ? [] : [activeBlockIndex.value]
}

function replaceTopLevelNodes(nodes: ProseMirrorNode[], exactMarkdown?: string) {
  if (!editor.value) return
  beginVisualOperation('blocks')
  forcedVisualMarkdown = exactMarkdown ?? null
  editor.value.view.dispatch(
    editor.value.state.tr.replaceWith(
      0,
      editor.value.state.doc.content.size,
      Fragment.fromArray(nodes),
    ),
  )
  if (forcedVisualMarkdown !== null) {
    const pendingMarkdown = forcedVisualMarkdown
    forcedVisualMarkdown = null
    commitVisualContent(editor.value, pendingMarkdown)
  }
}

function moveSelectedBlocks(targetIndex: number) {
  if (!editor.value) return
  const indices = selectedIndices()
  if (!indices.length) return
  const selected = new Set(indices)
  const nodes = Array.from({ length: editor.value.state.doc.childCount }, (_, index) =>
    editor.value!.state.doc.child(index),
  )
  const moving = nodes.filter((_, index) => selected.has(index))
  const remaining = nodes.filter((_, index) => !selected.has(index))
  const removedBefore = indices.filter((index) => index < targetIndex).length
  const insertion = Math.max(0, Math.min(targetIndex - removedBefore, remaining.length))
  const reordered = [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)]
  if (nodes.every((node, index) => node === reordered[index])) return
  const exactMarkdown = serializeVisualDocumentLosslessly(editor.value, reordered)
  replaceTopLevelNodes(reordered, exactMarkdown)
  selectedBlockIndices.value = moving.map((_, offset) => insertion + offset)
  activeBlockIndex.value = insertion
  syncBlockDecorations()
}

function duplicateSelectedBlocks() {
  if (!editor.value) return
  const indices = selectedIndices()
  if (!indices.length) return
  const nodes = Array.from({ length: editor.value.state.doc.childCount }, (_, index) =>
    editor.value!.state.doc.child(index),
  )
  const copies = indices.map((index) => nodes[index].copy(nodes[index].content))
  const insertion = indices.at(-1)! + 1
  replaceTopLevelNodes([...nodes.slice(0, insertion), ...copies, ...nodes.slice(insertion)])
  selectedBlockIndices.value = copies.map((_, offset) => insertion + offset)
  activeBlockIndex.value = insertion
  closeBlockMenu()
  syncBlockDecorations()
}

function deleteSelectedBlocks() {
  if (!editor.value) return
  const selected = new Set(selectedIndices())
  if (!selected.size) return
  const nodes = Array.from({ length: editor.value.state.doc.childCount }, (_, index) =>
    editor.value!.state.doc.child(index),
  ).filter((_, index) => !selected.has(index))
  replaceTopLevelNodes(nodes.length ? nodes : [editor.value.schema.nodes.paragraph.create()])
  selectedBlockIndices.value = []
  activeBlockIndex.value = null
  closeBlockMenu()
  syncBlockDecorations()
}

function insertBlock(relative: 'above' | 'below') {
  if (!editor.value || activeBlockIndex.value === null) return
  const index = activeBlockIndex.value + (relative === 'below' ? 1 : 0)
  const position = positionBeforeBlock(index)
  editor.value.commands.insertContentAt(position, { type: 'paragraph' })
  closeBlockMenu()
  clearBlockSelection()
  activeBlockIndex.value = index
  editor.value
    .chain()
    .focus()
    .setTextSelection(position + 1)
    .run()
}

function transformActiveBlock(command: EditorCommand) {
  runEditorCommand(command)
  closeBlockMenu()
}

function removeBlockPointerListeners() {
  window.removeEventListener('pointermove', handleBlockPointerMove)
  window.removeEventListener('pointerup', handleBlockPointerUp)
  window.removeEventListener('pointercancel', cancelBlockPointerDrag)
  window.removeEventListener('blur', cancelBlockPointerDrag)
}

function stopBlockAutoScroll() {
  if (blockAutoScrollFrame !== null) cancelAnimationFrame(blockAutoScrollFrame)
  blockAutoScrollFrame = null
}

function finishBlockDrag() {
  removeBlockPointerListeners()
  stopBlockAutoScroll()
  if (
    pointerCaptureElement &&
    pointerDrag &&
    pointerCaptureElement.hasPointerCapture(pointerDrag.pointerId)
  ) {
    pointerCaptureElement.releasePointerCapture(pointerDrag.pointerId)
  }
  pointerCaptureElement = null
  isBlockDragging.value = false
  dropBlockIndex.value = null
  blockDragGhost?.remove()
  blockDragGhost = null
  pointerDrag = null
  syncBlockDecorations()
}

function prepareBlockDrag(event: PointerEvent, index: number) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  if (blockMenuOpen.value) closeBlockMenu()
  editor.value?.view.focus()
  activeBlockIndex.value = index
  if (!selectedBlockIndices.value.includes(index) || event.shiftKey) {
    selectBlock(index, event.shiftKey)
  }
  pendingBlockClickSelection = {
    activeIndex: index,
    indices: [...selectedBlockIndices.value],
  }
  contextMenuPosition.value = null
  pointerDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
  }
  pointerCaptureElement = event.currentTarget as HTMLElement
  pointerCaptureElement.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', handleBlockPointerMove, { passive: false })
  window.addEventListener('pointerup', handleBlockPointerUp)
  window.addEventListener('pointercancel', cancelBlockPointerDrag)
  window.addEventListener('blur', cancelBlockPointerDrag)
}

function createBlockDragGhost() {
  const ghost = document.createElement('div')
  ghost.className = 'visual-block-drag-ghost'
  ghost.textContent = `${selectedIndices().length} block${selectedIndices().length === 1 ? '' : 's'}`
  document.body.append(ghost)
  blockDragGhost = ghost
}

function updateBlockDropTarget(clientY: number) {
  const blocks = topLevelElements()
  const firstAfterPointer = blocks.findIndex((block) => {
    const rect = block.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2
  })
  dropBlockIndex.value = firstAfterPointer < 0 ? blocks.length : firstAfterPointer
}

function blockAutoScrollDelta(clientY: number) {
  const viewport = scrollHost.value?.getBoundingClientRect()
  if (!viewport) return 0
  if (clientY < viewport.top + 48) return -14
  if (clientY > viewport.bottom - 48) return 14
  return 0
}

function runBlockAutoScroll() {
  blockAutoScrollFrame = null
  if (!pointerDrag || !isBlockDragging.value || !scrollHost.value) return
  const delta = blockAutoScrollDelta(pointerDrag.clientY)
  if (!delta) return
  scrollHost.value.scrollBy({ top: delta })
  updateBlockDropTarget(pointerDrag.clientY)
  blockAutoScrollFrame = requestAnimationFrame(runBlockAutoScroll)
}

function updateBlockDragAt(clientX: number, clientY: number) {
  if (blockDragGhost) {
    blockDragGhost.style.transform = `translate3d(${clientX + 14}px, ${clientY + 14}px, 0)`
  }
  updateBlockDropTarget(clientY)
  if (blockAutoScrollDelta(clientY)) {
    if (blockAutoScrollFrame === null)
      blockAutoScrollFrame = requestAnimationFrame(runBlockAutoScroll)
  } else {
    stopBlockAutoScroll()
  }
}

function handleBlockPointerMove(event: PointerEvent) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
  pointerDrag.clientX = event.clientX
  pointerDrag.clientY = event.clientY
  if (!isBlockDragging.value) {
    const distance = Math.hypot(
      event.clientX - pointerDrag.startX,
      event.clientY - pointerDrag.startY,
    )
    if (distance < 5) return
    isBlockDragging.value = true
    pendingBlockClickSelection = null
    createBlockDragGhost()
  }
  event.preventDefault()
  updateBlockDragAt(event.clientX, event.clientY)
}

function handleBlockPointerUp(event: PointerEvent) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
  if (isBlockDragging.value && dropBlockIndex.value !== null) {
    moveSelectedBlocks(dropBlockIndex.value)
  }
  finishBlockDrag()
}

function cancelBlockPointerDrag() {
  pendingBlockClickSelection = null
  finishBlockDrag()
}

function handleBlockHandleClick() {
  const pendingSelection = pendingBlockClickSelection
  pendingBlockClickSelection = null
  if (!editor.value || !pendingSelection) return
  requestAnimationFrame(() => {
    if (!editor.value) return
    editor.value.view.focus()
    selectedBlockIndices.value = pendingSelection.indices
    activeBlockIndex.value = pendingSelection.activeIndex
    editor.value.view.dispatch(
      editor.value.state.tr.setSelection(
        NodeSelection.create(
          editor.value.state.doc,
          positionBeforeBlock(pendingSelection.activeIndex),
        ),
      ),
    )
    syncBlockDecorations()
  })
}

const slashCommands: { label: string; command: EditorCommand }[] = [
  { label: 'Text', command: 'clear-formatting' },
  { label: 'Heading 1', command: 'heading-1' },
  { label: 'Heading 2', command: 'heading-2' },
  { label: 'Heading 3', command: 'heading-3' },
  { label: 'Bullet list', command: 'bullet-list' },
  { label: 'Ordered list', command: 'ordered-list' },
  { label: 'Task list', command: 'task-list' },
  { label: 'Quote', command: 'quote' },
  { label: 'Code block', command: 'code-block' },
  { label: 'Divider', command: 'horizontal-rule' },
  { label: 'Image', command: 'image' },
  { label: 'Table', command: 'insert-table' },
]

const filteredSlashCommands = computed(() => {
  const query = slashMenu.value?.query.toLowerCase() ?? ''
  return slashCommands.filter((item) => item.label.toLowerCase().includes(query))
})

function updateSlashMenu() {
  if (!editor.value || !editor.value.isFocused) {
    slashMenu.value = null
    return
  }
  const { $from, empty } = editor.value.state.selection
  const text =
    $from.parent.type.name === 'paragraph'
      ? $from.parent.textContent.slice(0, $from.parentOffset)
      : ''
  const match = empty ? /^\/([^\s]*)$/u.exec(text) : null
  if (!match) {
    slashMenu.value = null
    return
  }
  const coords = editor.value.view.coordsAtPos($from.pos)
  slashMenu.value = { query: match[1], selected: 0, top: coords.bottom + 6, left: coords.left }
}

function runSlashCommand(command: EditorCommand) {
  if (!editor.value || !slashMenu.value) return
  const { from } = editor.value.state.selection
  const length = slashMenu.value.query.length + 1
  editor.value.commands.deleteRange({ from: from - length, to: from })
  slashMenu.value = null
  runEditorCommand(command)
}

function scrollSlashSelectionIntoView() {
  nextTick(() => {
    slashMenuElement.value
      ?.querySelector<HTMLButtonElement>('button.active')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function updateContextMenu() {
  if (!editor.value || blockMenuOpen.value) {
    contextMenuPosition.value = null
    return
  }
  const selection = editor.value.state.selection
  if (selection instanceof NodeSelection) {
    contextMenuPosition.value = null
    return
  }
  const contextualNode =
    editor.value.isActive('table') ||
    editor.value.isActive('link') ||
    editor.value.isActive('image')
  const hasTextSelection = selection instanceof TextSelection && !selection.empty
  if (!hasTextSelection && !contextualNode) {
    contextMenuPosition.value = null
    return
  }
  const from = editor.value.view.coordsAtPos(selection.from)
  const to = editor.value.view.coordsAtPos(selection.to)
  contextMenuPosition.value = {
    top: Math.min(from.top, to.top) - 42,
    left: (from.left + to.right) / 2,
  }
}

function handleVisualKeydown(event: KeyboardEvent) {
  const primary = event.ctrlKey || event.metaKey
  if (primary && event.key.toLowerCase() === 'z') {
    emit('history-command', event.shiftKey ? 'redo' : 'undo')
    return true
  }
  if (primary && event.key.toLowerCase() === 'y') {
    emit('history-command', 'redo')
    return true
  }
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const index = activeBlockIndex.value ?? editor.value?.state.selection.$from.index(0) ?? 0
    selectBlock(index)
    moveSelectedBlocks(event.key === 'ArrowUp' ? index - 1 : index + 2)
    return true
  }
  if (slashMenu.value && filteredSlashCommands.value.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const direction = event.key === 'ArrowDown' ? 1 : -1
      slashMenu.value.selected =
        (slashMenu.value.selected + direction + filteredSlashCommands.value.length) %
        filteredSlashCommands.value.length
      scrollSlashSelectionIntoView()
      return true
    }
    if (event.key === 'Enter') {
      runSlashCommand(filteredSlashCommands.value[slashMenu.value.selected].command)
      return true
    }
    if (event.key === 'Escape') {
      slashMenu.value = null
      return true
    }
  }
  return false
}

function handleVisualScroll() {
  updateMapViewport()
}

function handleVisualFrameKeydown(event: KeyboardEvent) {
  const keepsBlockSelection = event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  const modifierOnly = ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)
  if (blockSelectionPinned && !blockMenuOpen.value && !keepsBlockSelection && !modifierOnly) {
    clearBlockSelection()
  }
  if (!handleVisualKeydown(event)) return
  event.preventDefault()
  event.stopPropagation()
}

function markVisualInput(event: Event) {
  if (event.type === 'pointerdown') {
    const target = event.target as HTMLElement | null
    if (blockMenuOpen.value && target?.closest('.tiptap')) closeBlockMenu()
    const block = target?.closest<HTMLElement>('.visual-block-node')
    const index = Number(block?.dataset.blockIndex)
    if (block && Number.isInteger(index)) activateBlock(index)
    if (!target?.matches('input[type="checkbox"]')) return
  }
  allowUnfocusedVisualUpdate = true
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!blockMenuOpen.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.visual-block-menu, .visual-block-menu-trigger')) return
  closeBlockMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !blockMenuOpen.value) return
  event.preventDefault()
  closeBlockMenu()
}

async function editSelectedImage() {
  if (!editor.value) return
  const attributes = editor.value.getAttributes('image') as { src?: string; alt?: string }
  const source = await openInputDialog(createImageInputDialog(attributes.src ?? ''))
  if (source === null) return
  runCommand(() => editor.value?.chain().focus().updateAttributes('image', { src: source }).run())
}

async function editSelectedImageAlt() {
  if (!editor.value) return
  const attributes = editor.value.getAttributes('image') as { alt?: string }
  const alt = await openInputDialog({
    title: 'Image alt text',
    message: 'Describe the image for readers using assistive technology.',
    initialValue: attributes.alt ?? '',
    placeholder: 'Short image description',
    inputLabel: 'Alt text',
    confirmLabel: 'Save',
  })
  if (alt === null) return
  runCommand(() => editor.value?.chain().focus().updateAttributes('image', { alt }).run())
}

function deleteContextNode() {
  runCommand(() => editor.value?.chain().focus().deleteSelection().run())
}

function openSelectedLink() {
  const href = String(editor.value?.getAttributes('link').href ?? '')
  if (href) openVisualLink(href)
}

function removeSelectedLink() {
  runCommand(() => editor.value?.chain().focus().unsetLink().run())
}

watch(
  () => [props.documentId, props.modelValue, props.revision] as const,
  ([documentId, value, revision], [previousDocumentId]) => {
    if (!editor.value) {
      return
    }

    const isDocumentSwitch = documentId !== previousDocumentId

    if (!isDocumentSwitch && isVisuallyEquivalentMarkdown(lastVisualMarkdown, value)) {
      lastAppliedRevision = revision
      hasVisualChanges = false
      return
    }

    applyExternalContent(value, revision, !isDocumentSwitch)
  },
)

watch(
  () => props.allowRemoteImages,
  (allowed) => {
    editorHost.value
      ?.querySelectorAll<
        HTMLDivElement & { renderWithPermission?: (nextAllowed: boolean) => void }
      >('.visual-image-node')
      .forEach((node) => {
        node.renderWithPermission?.(allowed)
        if (!allowed || node.querySelector('img')) return
        const source = node.dataset.imageSource ?? ''
        if (!/^https?:\/\//iu.test(source)) return
        const image = document.createElement('img')
        image.src = source
        image.alt = ''
        image.loading = 'lazy'
        node.replaceChildren(image)
      })
  },
)

onMounted(() => {
  if (!editorHost.value) {
    return
  }

  editor.value = createEditor(editorHost.value)
  snapshotVisualNodes(editor.value, props.modelValue)
  restoreViewState(props.viewState)
  requestAnimationFrame(() => {
    acceptVisualUpdates = true
  })
  scrollHost.value?.addEventListener('scroll', handleVisualScroll)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  if (scrollHost.value) {
    mapResizeObserver = new ResizeObserver(updateMapViewport)
    mapResizeObserver.observe(scrollHost.value)
  }
  nextTick(updateMapViewport)
})

function flushContent() {
  if (!hasVisualChanges) return props.modelValue
  const nextContent = editor.value
    ? serializeVisualDocumentLosslessly(editor.value)
    : props.modelValue

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

  beginVisualOperation('command')
  try {
    command()
    editor.value.commands.focus()
  } finally {
    updateContextMenu()
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
    editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run(),
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

  function logicalAnchor(position: number): LogicalSelectionAnchor | null {
    if (!editor.value || !props.blockDocument) return null
    const resolved = editor.value.state.doc.resolve(position)
    const blockIndex = Math.min(resolved.index(0), props.blockDocument.blocks.length - 1)
    const block = props.blockDocument.blocks[blockIndex]
    if (!block) return null
    const blockStart = resolved.depth > 0 ? resolved.start(1) : position
    return { blockId: block.id, relativeOffset: Math.max(position - blockStart, 0) }
  }

  return {
    scrollTop: scrollHost.value?.scrollTop ?? props.viewState.scrollTop,
    selectionState: selection
      ? {
          kind: 'visual',
          from: selection.from,
          to: selection.to,
        }
      : props.viewState.selectionState,
    logicalSelection: selection
      ? { anchor: logicalAnchor(selection.from), head: logicalAnchor(selection.to) }
      : props.viewState.logicalSelection,
    isFocused: editor.value?.isFocused ?? false,
  }
}

function restoreViewState(
  viewState: Pick<
    EditorViewSession,
    'scrollTop' | 'selectionState' | 'logicalSelection' | 'isFocused'
  >,
) {
  if (editor.value) {
    const nextMaxPosition = editor.value.state.doc.content.size
    function visualPosition(anchor: LogicalSelectionAnchor | null) {
      if (!anchor || !props.blockDocument || !editor.value) return null
      const blockIndex = props.blockDocument.blocks.findIndex(
        (block) => block.id === anchor.blockId,
      )
      if (blockIndex < 0 || blockIndex >= editor.value.state.doc.childCount) return null
      let blockStart = 1
      for (let index = 0; index < blockIndex; index += 1) {
        blockStart += editor.value.state.doc.child(index).nodeSize
      }
      const block = editor.value.state.doc.child(blockIndex)
      return Math.min(
        blockStart + Math.max(anchor.relativeOffset, 0),
        blockStart + block.content.size,
      )
    }
    const logicalFrom = visualPosition(viewState.logicalSelection?.anchor ?? null)
    const logicalTo = visualPosition(viewState.logicalSelection?.head ?? null)
    const selection =
      logicalFrom !== null && logicalTo !== null
        ? { from: logicalFrom, to: logicalTo }
        : toVisualSelectionState(viewState.selectionState, nextMaxPosition)

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
    'heading-1': () =>
      runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 1 }).run()),
    'heading-2': () =>
      runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 2 }).run()),
    'heading-3': () =>
      runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 3 }).run()),
    'heading-4': () =>
      runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 4 }).run()),
    'heading-5': () =>
      runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 5 }).run()),
    'heading-6': () =>
      runCommand(() => editor.value?.chain().focus().toggleHeading({ level: 6 }).run()),
    bold: () => runCommand(() => editor.value?.chain().focus().toggleBold().run()),
    italic: () => runCommand(() => editor.value?.chain().focus().toggleItalic().run()),
    strike: () => runCommand(() => editor.value?.chain().focus().toggleStrike().run()),
    'inline-code': () => runCommand(() => editor.value?.chain().focus().toggleCode().run()),
    'clear-formatting': () =>
      runCommand(() => editor.value?.chain().focus().unsetAllMarks().clearNodes().run()),
    'bullet-list': () => runCommand(() => editor.value?.chain().focus().toggleBulletList().run()),
    'ordered-list': () => runCommand(() => editor.value?.chain().focus().toggleOrderedList().run()),
    'task-list': () =>
      runCommand(() =>
        (
          editor.value?.chain().focus() as unknown as {
            toggleTaskList: () => { run: () => boolean }
          }
        )
          .toggleTaskList()
          .run(),
      ),
    quote: () => runCommand(() => editor.value?.chain().focus().toggleBlockquote().run()),
    'code-block': () => runCommand(() => editor.value?.chain().focus().toggleCodeBlock().run()),
    link: () => setLink(),
    image: () => setImage(),
    'horizontal-rule': () =>
      runCommand(() => editor.value?.chain().focus().setHorizontalRule().run()),
    'insert-table': () =>
      runTableCommand((chain) =>
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      ),
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
  insertTable: (options: { rows: number; cols: number; withHeaderRow: boolean }) => {
    run: () => boolean
  }
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
  finishBlockDrag()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  scrollHost.value?.removeEventListener('scroll', handleVisualScroll)
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

    <div
      class="visual-editor"
      :class="{
        'visual-editor-block-menu-open': blockMenuOpen,
        'visual-editor-block-dragging': isBlockDragging,
      }"
      data-testid="visual-editor"
      :data-remote-images-allowed="allowRemoteImages"
      @keydown.capture="handleVisualFrameKeydown"
      @beforeinput.capture="markVisualInput"
      @pointerdown.capture="markVisualInput"
    >
      <div
        v-if="dropBlockIndex !== null"
        class="visual-block-drop-line"
        :style="{
          top: `${topLevelElements()[dropBlockIndex]?.getBoundingClientRect().top ?? topLevelElements().at(-1)?.getBoundingClientRect().bottom ?? 0}px`,
          left: `${topLevelElements()[0]?.getBoundingClientRect().left ?? 0}px`,
          width: `${topLevelElements()[0]?.getBoundingClientRect().width ?? 0}px`,
        }"
      />
      <div
        v-if="blockMenuOpen && activeBlockIndex !== null"
        ref="blockMenuElement"
        class="visual-floating-menu visual-block-menu"
        :style="{ top: `${blockMenuPosition.top}px`, left: `${blockMenuPosition.left}px` }"
        data-testid="visual-block-menu"
      >
        <template v-if="!blockTransformMenuOpen">
          <div class="visual-block-menu-title">Block actions</div>
          <button type="button" @click="insertBlock('above')">
            <ArrowUpToLine :size="16" />
            <span>Insert above</span>
          </button>
          <button type="button" @click="insertBlock('below')">
            <ArrowDownToLine :size="16" />
            <span>Insert below</span>
          </button>
          <button type="button" @click="duplicateSelectedBlocks">
            <Copy :size="16" />
            <span>Duplicate</span>
          </button>
          <button type="button" @click="openBlockTransformMenu">
            <ChevronRight :size="16" />
            <span>Turn into</span>
          </button>
          <div class="visual-block-menu-separator" />
          <button type="button" class="danger" @click="deleteSelectedBlocks">
            <Trash2 :size="16" />
            <span>Delete</span>
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="visual-block-menu-back"
            @click="blockTransformMenuOpen = false"
          >
            <ChevronLeft :size="16" />
            <span>Turn into</span>
          </button>
          <div class="visual-block-menu-separator" />
          <div class="visual-block-transform-list">
            <button type="button" @click="transformActiveBlock('clear-formatting')">
              <Type :size="16" />
              <span>Text</span>
            </button>
            <button type="button" @click="transformActiveBlock('heading-1')">
              <Heading1 :size="16" />
              <span>Heading 1</span>
            </button>
            <button type="button" @click="transformActiveBlock('heading-2')">
              <Heading2 :size="16" />
              <span>Heading 2</span>
            </button>
            <button type="button" @click="transformActiveBlock('heading-3')">
              <Heading3 :size="16" />
              <span>Heading 3</span>
            </button>
            <button type="button" @click="transformActiveBlock('heading-4')">
              <Heading4 :size="16" />
              <span>Heading 4</span>
            </button>
            <button type="button" @click="transformActiveBlock('heading-5')">
              <Heading5 :size="16" />
              <span>Heading 5</span>
            </button>
            <button type="button" @click="transformActiveBlock('heading-6')">
              <Heading6 :size="16" />
              <span>Heading 6</span>
            </button>
            <button type="button" @click="transformActiveBlock('bullet-list')">
              <List :size="16" />
              <span>Bullet list</span>
            </button>
            <button type="button" @click="transformActiveBlock('ordered-list')">
              <ListOrdered :size="16" />
              <span>Ordered list</span>
            </button>
            <button type="button" @click="transformActiveBlock('task-list')">
              <ListChecks :size="16" />
              <span>Task list</span>
            </button>
            <button type="button" @click="transformActiveBlock('quote')">
              <Quote :size="16" />
              <span>Quote</span>
            </button>
            <button type="button" @click="transformActiveBlock('code-block')">
              <Code2 :size="16" />
              <span>Code block</span>
            </button>
          </div>
        </template>
      </div>
      <div
        v-if="slashMenu"
        ref="slashMenuElement"
        class="visual-floating-menu visual-slash-menu"
        :style="{ top: `${slashMenu.top}px`, left: `${slashMenu.left}px` }"
        data-testid="visual-slash-menu"
      >
        <button
          v-for="(item, index) in filteredSlashCommands"
          :key="item.command"
          type="button"
          :class="{ active: index === slashMenu.selected }"
          @mousedown.prevent="runSlashCommand(item.command)"
        >
          {{ item.label }}
        </button>
        <span v-if="filteredSlashCommands.length === 0">No commands</span>
      </div>
      <div
        v-if="contextMenuPosition"
        class="visual-context-menu"
        :style="{ top: `${contextMenuPosition.top}px`, left: `${contextMenuPosition.left}px` }"
        data-testid="visual-context-menu"
      >
        <template v-if="editor?.isActive('table')">
          <button type="button" @click="runEditorCommand('add-row-before')">Add row before</button>
          <button type="button" @click="runEditorCommand('add-row-after')">Add row after</button>
          <button type="button" @click="runEditorCommand('delete-row')">Delete row</button>
          <button type="button" @click="runEditorCommand('add-column-before')">
            Add column before
          </button>
          <button type="button" @click="runEditorCommand('add-column-after')">
            Add column after
          </button>
          <button type="button" @click="runEditorCommand('delete-column')">Delete column</button>
          <button type="button" @click="runEditorCommand('delete-table')">Delete table</button>
        </template>
        <template v-else-if="editor?.isActive('image')">
          <button type="button" @click="editSelectedImage">Source</button>
          <button type="button" @click="editSelectedImageAlt">Alt</button>
          <button type="button" @click="deleteContextNode">Delete</button>
        </template>
        <template v-else-if="editor?.isActive('link')">
          <button type="button" @click="openSelectedLink">Open</button>
          <button type="button" @click="setLink">Edit</button>
          <button type="button" @click="removeSelectedLink">Remove</button>
        </template>
        <template v-else>
          <button type="button" @click="runEditorCommand('bold')">Bold</button>
          <button type="button" @click="runEditorCommand('italic')">Italic</button>
          <button type="button" @click="runEditorCommand('strike')">Strike</button>
          <button type="button" @click="runEditorCommand('inline-code')">Code</button>
          <button type="button" @click="runEditorCommand('link')">Link</button>
          <button type="button" @click="runEditorCommand('clear-formatting')">Clear</button>
        </template>
      </div>
      <div ref="scrollHost" class="visual-editor-scroll">
        <div ref="editorHost" class="visual-editor-content" @click.capture="handleVisualClick" />
      </div>
    </div>

    <DocumentMap
      v-if="showDocumentMap"
      :lines="mapBlocks"
      :line-positions="mapLinePositions"
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
