<script setup lang="ts">
import { type Editor as CoreEditor } from '@tiptap/core'
import { Editor } from '@tiptap/vue-3'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
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
import { validateLinkTarget } from '../../domain/markdown/markdownSafety'
import type { EditorCommand } from '../../application/types/shell'
import { findActiveHeading } from '../../domain/markdown/outline'
import type { DocumentAnalysisResult } from '../../domain/markdown/documentAnalysis'
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
import { buildVisualMarkdownProjection } from './visualProjection'
import { createVisualEditor } from './visualEditorSetup'
import { useVisualBlockControls } from './useVisualBlockControls'
import VisualContextToolbar from './VisualContextToolbar.vue'
import type { VisualContextToolbarContext } from './VisualContextToolbar.vue'

const props = defineProps<{
  documentId: string
  viewId: string
  modelValue: string
  revision: number
  analysis: DocumentAnalysisResult | null
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
const headingScrollPositions = ref<Record<string, number>>({})
const activeHeadingId = ref<string | null>(null)
const editor = shallowRef<Editor | null>(null)
const inputDialog = ref<EditorInputDialogState | null>(null)
const inputDialogError = ref<string | null>(null)
const slashMenu = ref<{ query: string; selected: number; top: number; left: number } | null>(null)
const contextMenuPosition = ref<{ top: number; left: number } | null>(null)
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false
let resolveInputDialog: ((value: string | null) => void) | null = null
let mapResizeObserver: ResizeObserver | null = null
let scrollFrame = 0
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

function beginVisualOperation(kind: string) {
  const group = `visual-${kind}-${visualOperationSequence++}`
  visualOperationGroup = group
  allowUnfocusedVisualUpdate = true
  queueMicrotask(() => {
    if (visualOperationGroup === group) visualOperationGroup = null
  })
}

const headings = computed(() => props.analysis?.headings ?? [])
const showOutline = computed(() => props.showDocumentOutline && headings.value.length > 0)
const mapSegments = computed(() => props.analysis?.mapSegments ?? [])
const showDocumentMap = computed(() => props.showDocumentMap && mapSegments.value.length > 0)
const contextToolbarContext = computed<VisualContextToolbarContext>(() => {
  if (editor.value?.isActive('table')) return 'table'
  if (editor.value?.isActive('image')) return 'image'
  if (editor.value?.isActive('link')) return 'link'
  return 'text'
})

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

function createEditor(element: HTMLDivElement) {
  return createVisualEditor({
    element,
    content: buildVisualMarkdownProjection(props.modelValue, props.blockDocument),
    allowRemoteImages: props.allowRemoteImages,
    documentPath: props.documentPath,
    workspaceRootPath: props.workspaceRootPath,
    blockControls: blockControls.extension,
    onRawEdit: () => beginVisualOperation('raw'),
    onRawCollapse: reparseRawBlock,
    onKeyDown: handleVisualKeydown,
    onCreate: (createdEditor) => {
      lastAppliedRevision = props.revision
      lastVisualMarkdown = props.modelValue
      hasVisualChanges = false
      snapshotVisualNodes(createdEditor, props.modelValue)
      emitToolbarState()
    },
    onSelectionUpdate: (updatedEditor) => {
      if (!(updatedEditor.state.selection instanceof NodeSelection) && !blockMenuOpen.value) {
        activateBlock(updatedEditor.state.selection.$from.index(0))
      }
      emitToolbarState()
      updateContextMenu()
      updateSlashMenu()
    },
    onUpdate: (updatedEditor) => {
      if (!(updatedEditor.state.selection instanceof NodeSelection) && !blockMenuOpen.value) {
        activateBlock(updatedEditor.state.selection.$from.index(0))
      }
      emitToolbarState()
      updateContextMenu()
      updateSlashMenu()
      if (isApplyingExternalContent) return
      if (!acceptVisualUpdates) return
      if (!updatedEditor.isFocused && !allowUnfocusedVisualUpdate) return
      allowUnfocusedVisualUpdate = false
      const nextContent = forcedVisualMarkdown ?? serializeVisualDocumentLosslessly(updatedEditor)
      forcedVisualMarkdown = null
      commitVisualContent(updatedEditor, nextContent)
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

function measureHeadingPositions() {
  const scrollElement = scrollHost.value
  if (!scrollElement) return
  const scrollRect = scrollElement.getBoundingClientRect()
  const scrollHeight = Math.max(scrollElement.scrollHeight, 1)
  const entries = headings.value.map((heading) => {
    const rect = findAnchorTarget(`#${encodeURIComponent(heading.id)}`)?.getBoundingClientRect()
    return {
      heading,
      top: rect ? rect.top - scrollRect.top + scrollElement.scrollTop : Number.POSITIVE_INFINITY,
    }
  })
  headingScrollPositions.value = Object.fromEntries(
    entries.map(({ heading, top }) => [heading.id, top]),
  )
  mapLinePositions.value = Object.fromEntries(
    entries
      .filter(({ top }) => Number.isFinite(top))
      .map(({ heading, top }) => [heading.line - 1, (top / scrollHeight) * 100]),
  )
  updateMapViewport()
}

function updateActiveHeading() {
  if (!scrollHost.value || !editorHost.value || headings.value.length === 0) {
    activeHeadingId.value = null
    return
  }

  activeHeadingId.value = findActiveHeading(
    headings.value,
    headingScrollPositions.value,
    scrollHost.value.scrollTop,
  )
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

function viewportClampedPosition(element: HTMLElement, position: { top: number; left: number }) {
  const margin = 12
  const rect = element.getBoundingClientRect()
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin)
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
  return {
    top: Math.max(margin, Math.min(position.top, maxTop)),
    left: Math.max(margin, Math.min(position.left, maxLeft)),
  }
}

function clampSlashMenuToViewport() {
  const menu = slashMenuElement.value
  if (!menu || !slashMenu.value) return
  const position = viewportClampedPosition(menu, slashMenu.value)
  slashMenu.value = { ...slashMenu.value, ...position }
}

function clampFloatingMenusToViewport() {
  blockControls.clampBlockMenuToViewport()
  clampSlashMenuToViewport()
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

const blockControls = useVisualBlockControls({
  editor,
  scrollHost,
  blockMenuElement,
  replaceTopLevelNodes,
  serializeTopLevelNodes: serializeVisualDocumentLosslessly,
  updateContextMenu,
})
const {
  activeBlockIndex,
  blockMenuOpen,
  blockTransformMenuOpen,
  blockMenuPosition,
  isBlockDragging,
  dropBlockIndex,
  activateBlock,
  closeBlockMenu,
  openBlockTransformMenu,
  duplicateSelectedBlocks,
  deleteSelectedBlocks,
  insertBlock,
  finishBlockDrag,
  handleDocumentPointerDown,
  handleDocumentKeydown,
  topLevelElements,
} = blockControls

function transformActiveBlock(command: EditorCommand) {
  runEditorCommand(command)
  closeBlockMenu()
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
  nextTick(clampSlashMenuToViewport)
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
  if (selection instanceof NodeSelection && !editor.value.isActive('image')) {
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
  if (blockControls.handleBlockKeydown(event)) return true
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
  window.cancelAnimationFrame(scrollFrame)
  scrollFrame = window.requestAnimationFrame(updateMapViewport)
}

function handleVisualFrameKeydown(event: KeyboardEvent) {
  blockControls.prepareFrameKeydown(event)
  if (!handleVisualKeydown(event)) return
  event.preventDefault()
  event.stopPropagation()
}

function markVisualInput(event: Event) {
  blockControls.markBlockInput(event)
  if (event.type === 'pointerdown') {
    const target = event.target as HTMLElement | null
    if (!target?.matches('input[type="checkbox"]')) return
  }
  allowUnfocusedVisualUpdate = true
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
  window.addEventListener('resize', clampFloatingMenusToViewport)
  if (scrollHost.value) {
    mapResizeObserver = new ResizeObserver(measureHeadingPositions)
    mapResizeObserver.observe(scrollHost.value)
    if (editorHost.value) mapResizeObserver.observe(editorHost.value)
  }
  nextTick(measureHeadingPositions)
})

watch(headings, () => nextTick(measureHeadingPositions))

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
  window.removeEventListener('resize', clampFloatingMenusToViewport)
  scrollHost.value?.removeEventListener('scroll', handleVisualScroll)
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
  window.cancelAnimationFrame(scrollFrame)
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
      <VisualContextToolbar
        v-if="contextMenuPosition"
        :context="contextToolbarContext"
        :position="contextMenuPosition"
        @run-command="runEditorCommand"
        @edit-image-source="editSelectedImage"
        @edit-image-alt="editSelectedImageAlt"
        @delete-node="deleteContextNode"
        @open-link="openSelectedLink"
        @edit-link="setLink"
        @remove-link="removeSelectedLink"
      />
      <div ref="scrollHost" class="visual-editor-scroll">
        <div ref="editorHost" class="visual-editor-content" @click.capture="handleVisualClick" />
      </div>
    </div>

    <DocumentMap
      v-if="showDocumentMap"
      :segments="mapSegments"
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
