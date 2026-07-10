<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection } from '@codemirror/state'
import { tags } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import type { EditorViewSession } from '../../domain/documents/editorSync'
import { toSourceSelectionState } from '../../domain/documents/editorViewState'
import type { EditorCommand } from '../../application/types/shell'
import {
  buildDocumentMapLines,
  extractMarkdownHeadings,
  findActiveHeading,
} from '../../domain/markdown/outline'
import type { MarkdownHeading } from '../../domain/markdown/outline'
import PromptDialog from '../dialogs/PromptDialog.vue'
import DocumentMap from '../navigation/DocumentMap.vue'
import DocumentOutline from '../navigation/DocumentOutline.vue'
import {
  createImageInputDialog,
  createLinkInputDialog,
  type EditorInputDialogState,
} from './editorInputDialogs'

const props = defineProps<{
  documentId: string
  viewId: string
  modelValue: string
  revision: number
  wordWrap: boolean
  isMarkdown: boolean
  outlineWidth: number
  documentMapWidth: number
  showDocumentOutline: boolean
  showDocumentMap: boolean
  viewState: EditorViewSession
}>()

const emit = defineEmits<{
  'document-update': [update: DocumentUpdate]
  'set-outline-width': [width: number]
  'set-document-map-width': [width: number]
}>()

const editorHost = ref<HTMLDivElement | null>(null)
const mapViewport = ref({ top: 0, height: 100 })
const activeHeadingId = ref<string | null>(null)
const inputDialog = ref<EditorInputDialogState | null>(null)
const inputDialogError = ref<string | null>(null)
let editorView: EditorView | null = null
let mapResizeObserver: ResizeObserver | null = null
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false
let resolveInputDialog: ((value: string | null) => void) | null = null

const sourceTheme = EditorView.theme({
  '&': {
    backgroundColor: '#15181d',
    color: '#d9dee7',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'var(--source-font-family)',
    lineHeight: '1.65',
  },
  '.cm-content': {
    caretColor: '#f2c572',
    padding: '20px 24px',
  },
  '.cm-gutters': {
    backgroundColor: '#15181d',
    color: '#687383',
    borderRight: '1px solid #2b313a',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: '#20252d',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: '#41506a',
  },
  '.cm-cursor': {
    borderLeftColor: '#f2c572',
  },
}, { dark: true })

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: '#f2c572', fontWeight: '700' },
  { tag: [tags.link, tags.url], color: '#86b7ff' },
  { tag: tags.emphasis, color: '#e0b7ff', fontStyle: 'italic' },
  { tag: tags.strong, color: '#ffd98f', fontWeight: '700' },
  { tag: tags.monospace, color: '#8dd7c0' },
  { tag: tags.quote, color: '#aeb7c5', fontStyle: 'italic' },
])

const headings = computed(() => props.isMarkdown ? extractMarkdownHeadings(props.modelValue) : [])
const showOutline = computed(() => props.showDocumentOutline && headings.value.length > 0)
const mapLines = computed(() => props.isMarkdown ? buildDocumentMapLines(props.modelValue) : [])
const showDocumentMap = computed(() => props.showDocumentMap && mapLines.value.length > 0)

function clampPosition(position: number) {
  return Math.min(Math.max(position, 0), editorView?.state.doc.length ?? 0)
}

function selectedText() {
  const selection = editorView?.state.selection.main

  if (!editorView || !selection || selection.empty) {
    return ''
  }

  return editorView.state.doc.sliceString(selection.from, selection.to)
}

function dispatchReplacement(from: number, to: number, insert: string, anchor: number, head = anchor) {
  editorView?.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.single(anchor, head),
    scrollIntoView: true,
  })
  editorView?.focus()
}

function replaceCurrentSelection(insert: string, selectFrom: number, selectTo = selectFrom) {
  if (!editorView) {
    return
  }

  const selection = editorView.state.selection.main
  dispatchReplacement(selection.from, selection.to, insert, selection.from + selectFrom, selection.from + selectTo)
}

function surroundSelection(prefix: string, suffix = prefix, placeholder = 'text') {
  if (!editorView) {
    return
  }

  const selection = editorView.state.selection.main
  const text = selection.empty ? placeholder : editorView.state.doc.sliceString(selection.from, selection.to)
  const insert = `${prefix}${text}${suffix}`
  dispatchReplacement(
    selection.from,
    selection.to,
    insert,
    selection.from + prefix.length,
    selection.from + prefix.length + text.length,
  )
}

function replaceSelectedLines(transform: (line: string, index: number) => string) {
  if (!editorView) {
    return
  }

  const selection = editorView.state.selection.main
  const startLine = editorView.state.doc.lineAt(selection.from)
  const endLine = editorView.state.doc.lineAt(selection.to)
  const text = editorView.state.doc.sliceString(startLine.from, endLine.to)
  const insert = text.split('\n').map(transform).join('\n')

  dispatchReplacement(startLine.from, endLine.to, insert, startLine.from, startLine.from + insert.length)
}

function normalizeBlockLine(line: string) {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/u, '')
    .replace(/^\s{0,3}>\s?/u, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/u, '')
    .replace(/^\s{0,3}[-*+]\s+\[[ xX]\]\s+/u, '')
}

function setHeading(level: number) {
  replaceSelectedLines((line) => `${'#'.repeat(level)} ${normalizeBlockLine(line) || 'Heading'}`)
}

function scrollToLine(lineNumber: number) {
  if (!editorView) {
    return
  }

  const line = editorView.state.doc.line(Math.min(Math.max(lineNumber, 1), editorView.state.doc.lines))
  editorView.dispatch({
    selection: EditorSelection.cursor(line.from),
    scrollIntoView: true,
  })
  editorView.focus()
  editorView.requestMeasure({ read: updateMapViewport })
}

function scrollToHeading(heading: MarkdownHeading) {
  activeHeadingId.value = heading.id
  scrollToLine(heading.line)
}

function updateMapViewport() {
  const scrollElement = editorView?.scrollDOM

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
  if (!editorView || headings.value.length === 0) {
    activeHeadingId.value = null
    return
  }

  const scrollElement = editorView.scrollDOM
  const positions = Object.fromEntries(headings.value.map((heading) => {
    const line = editorView!.state.doc.line(Math.min(Math.max(heading.line, 1), editorView!.state.doc.lines))
    return [heading.id, editorView!.lineBlockAt(line.from).top]
  }))
  activeHeadingId.value = findActiveHeading(headings.value, positions, scrollElement.scrollTop)
}

function scrollMapToRatio(ratio: number) {
  if (!editorView) {
    return
  }

  editorView.scrollDOM.scrollTop = ratio * (editorView.scrollDOM.scrollHeight - editorView.scrollDOM.clientHeight)
  updateMapViewport()
}

type MarkdownLinkMatch = {
  from: number
  to: number
  text: string
  url: string
}

function isEscaped(value: string, index: number) {
  let slashCount = 0

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }

  return slashCount % 2 === 1
}

function findClosingBracket(value: string, start: number) {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === ']' && !isEscaped(value, index)) {
      return index
    }
  }

  return -1
}

function findClosingParen(value: string, start: number) {
  let depth = 1

  for (let index = start + 1; index < value.length; index += 1) {
    if (isEscaped(value, index)) {
      continue
    }

    if (value[index] === '(') {
      depth += 1
      continue
    }

    if (value[index] === ')') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function findCurrentMarkdownLink(): MarkdownLinkMatch | null {
  if (!editorView) {
    return null
  }

  const selection = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(selection.from)
  const lineText = editorView.state.doc.sliceString(line.from, line.to)
  let index = 0

  while (index < lineText.length) {
    const linkStart = lineText.indexOf('[', index)

    if (linkStart === -1) {
      return null
    }

    if (isEscaped(lineText, linkStart)) {
      index = linkStart + 1
      continue
    }

    const textEnd = findClosingBracket(lineText, linkStart)

    if (textEnd === -1 || lineText[textEnd + 1] !== '(') {
      index = linkStart + 1
      continue
    }

    const urlEnd = findClosingParen(lineText, textEnd + 1)

    if (urlEnd === -1) {
      index = linkStart + 1
      continue
    }

    const from = line.from + linkStart
    const to = line.from + urlEnd + 1

    if (selection.from <= to && selection.to >= from) {
      return {
        from,
        to,
        text: lineText.slice(linkStart + 1, textEnd),
        url: lineText.slice(textEnd + 2, urlEnd),
      }
    }

    index = urlEnd + 1
  }

  return null
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
  if (!editorView) {
    return
  }

  const existingLink = findCurrentMarkdownLink()
  const url = await openInputDialog(createLinkInputDialog(existingLink?.url ?? ''))

  if (url === null) {
    return
  }

  if (existingLink) {
    const insert = url ? `[${existingLink.text}](${url})` : existingLink.text
    dispatchReplacement(existingLink.from, existingLink.to, insert, existingLink.from, existingLink.from + insert.length)
    return
  }

  if (!url) {
    return
  }

  const text = selectedText() || 'link'
  replaceCurrentSelection(`[${text}](${url})`, 1, 1 + text.length)
}

async function setImage() {
  const url = await openInputDialog(createImageInputDialog())

  if (!url) {
    return
  }

  const alt = selectedText() || 'image'
  replaceCurrentSelection(`![${alt}](${url})`, 2, 2 + alt.length)
}

function insertMarkdownTable() {
  replaceCurrentSelection('| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n', 2, 10)
}

function runCommand(command: EditorCommand) {
  const commands: Record<EditorCommand, () => void | Promise<void>> = {
    'heading-1': () => setHeading(1),
    'heading-2': () => setHeading(2),
    'heading-3': () => setHeading(3),
    'heading-4': () => setHeading(4),
    'heading-5': () => setHeading(5),
    'heading-6': () => setHeading(6),
    bold: () => surroundSelection('**'),
    italic: () => surroundSelection('_'),
    strike: () => surroundSelection('~~'),
    'inline-code': () => surroundSelection('`'),
    'clear-formatting': () => replaceSelectedLines((line) => normalizeBlockLine(line)
      .replace(/\*\*([^*]+)\*\*/gu, '$1')
      .replace(/~~([^~]+)~~/gu, '$1')
      .replace(/_([^_]+)_/gu, '$1')
      .replace(/`([^`]+)`/gu, '$1')),
    'bullet-list': () => replaceSelectedLines((line) => `- ${normalizeBlockLine(line) || 'List item'}`),
    'ordered-list': () => replaceSelectedLines((line, index) => `${index + 1}. ${normalizeBlockLine(line) || 'List item'}`),
    'task-list': () => replaceSelectedLines((line) => `- [ ] ${normalizeBlockLine(line) || 'Task item'}`),
    quote: () => replaceSelectedLines((line) => `> ${line.replace(/^\s{0,3}>\s?/u, '') || 'Quote'}`),
    'code-block': () => {
      const text = selectedText() || 'code'
      replaceCurrentSelection(`\`\`\`\n${text}\n\`\`\``, 4, 4 + text.length)
    },
    link: () => setLink(),
    image: () => setImage(),
    'horizontal-rule': () => replaceCurrentSelection('\n---\n', 5),
    'insert-table': () => insertMarkdownTable(),
    'add-row-before': () => undefined,
    'add-row-after': () => undefined,
    'delete-row': () => undefined,
    'add-column-before': () => undefined,
    'add-column-after': () => undefined,
    'delete-column': () => undefined,
    'delete-table': () => undefined,
  }

  void commands[command]()
}

onMounted(() => {
  if (!editorHost.value) {
    return
  }

  editorView = new EditorView({
    doc: props.modelValue,
    parent: editorHost.value,
    extensions: [
      basicSetup,
      markdown(),
      sourceTheme,
      syntaxHighlighting(markdownHighlightStyle),
      ...(props.wordWrap ? [EditorView.lineWrapping] : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isApplyingExternalContent) {
          emit('document-update', {
            documentId: props.documentId,
            originViewId: props.viewId,
            baseRevision: lastAppliedRevision,
            nextContent: update.state.doc.toString(),
            updateKind: 'source-edit',
          })
          lastAppliedRevision += 1
        }
      }),
    ],
  })
  restoreViewState(props.viewState)
  editorView.scrollDOM.addEventListener('scroll', updateMapViewport)
  mapResizeObserver = new ResizeObserver(updateMapViewport)
  mapResizeObserver.observe(editorView.scrollDOM)
  nextTick(updateMapViewport)
})

watch(
  () => [props.documentId, props.modelValue, props.revision] as const,
  ([documentId, value, revision], [previousDocumentId]) => {
    if (!editorView) {
      return
    }

    const currentValue = editorView.state.doc.toString()
    const isDocumentSwitch = documentId !== previousDocumentId

    if (value === currentValue) {
      lastAppliedRevision = revision
      return
    }

    const selection = editorView.state.selection.main
    const nextLength = value.length
    const anchor = Math.min(selection.anchor, nextLength)
    const head = Math.min(selection.head, nextLength)
    const scrollTop = editorView.scrollDOM.scrollTop
    isApplyingExternalContent = true
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: value,
      },
      selection: EditorSelection.single(anchor, head),
    })
    lastAppliedRevision = revision
    isApplyingExternalContent = false

    if (!isDocumentSwitch) {
      requestAnimationFrame(() => {
        if (editorView) {
          editorView.scrollDOM.scrollTop = scrollTop
          updateMapViewport()
        }
      })
    }

    nextTick(updateMapViewport)
  },
)

function flushContent() {
  return editorView?.state.doc.toString() ?? props.modelValue
}

function captureViewState() {
  const selection = editorView?.state.selection.main

  return {
    scrollTop: editorView?.scrollDOM.scrollTop ?? props.viewState.scrollTop,
    selectionState: selection
      ? {
          kind: 'source',
          anchor: selection.anchor,
          head: selection.head,
        }
      : props.viewState.selectionState,
    isFocused: editorView?.hasFocus ?? false,
  }
}

function restoreViewState(viewState: Pick<EditorViewSession, 'scrollTop' | 'selectionState' | 'isFocused'>) {
  if (!editorView) {
    return
  }

  const selection = toSourceSelectionState(viewState.selectionState, editorView.state.doc.length)

  if (selection) {
    editorView.dispatch({
      selection: EditorSelection.single(clampPosition(selection.anchor), clampPosition(selection.head)),
      scrollIntoView: true,
    })
  }

  requestAnimationFrame(() => {
    if (!editorView) {
      return
    }

    editorView.scrollDOM.scrollTop = viewState.scrollTop
    updateMapViewport()

    if (viewState.isFocused) {
      editorView.focus()
    }
  })
}

defineExpose({
  captureViewState,
  flushContent,
  restoreViewState,
  runCommand,
})

onBeforeUnmount(() => {
  editorView?.scrollDOM.removeEventListener('scroll', updateMapViewport)
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
  editorView?.destroy()
  editorView = null
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
      @select="scrollToHeading"
      @resize="emit('set-outline-width', $event)"
    />
    <div ref="editorHost" class="source-editor" data-testid="source-editor" />
    <DocumentMap
      v-if="showDocumentMap"
      :lines="mapLines"
      :viewport="mapViewport"
      :width="documentMapWidth"
      @navigate="scrollMapToRatio"
      @resize="emit('set-document-map-width', $event)"
    />
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
</template>
