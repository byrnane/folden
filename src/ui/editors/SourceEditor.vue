<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection } from '@codemirror/state'
import { tags } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DocumentUpdate } from '../../domain/documents/editorSync'
import type { EditorViewSession } from '../../domain/documents/editorSync'
import type { EditorCommand } from '../../application/types/shell'

const props = defineProps<{
  documentId: string
  viewId: string
  modelValue: string
  revision: number
  wordWrap: boolean
  viewState: EditorViewSession
}>()

const emit = defineEmits<{
  'document-update': [update: DocumentUpdate]
}>()

const editorHost = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false

type SourceSelectionState = {
  anchor: number
  head: number
}

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

function normalizeSelectionState(value: unknown): SourceSelectionState | null {
  if (
    typeof value === 'object'
    && value !== null
    && typeof (value as SourceSelectionState).anchor === 'number'
    && typeof (value as SourceSelectionState).head === 'number'
  ) {
    return value as SourceSelectionState
  }

  return null
}

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

function runCommand(command: EditorCommand) {
  const commands: Record<EditorCommand, () => void> = {
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
    link: () => {
      const text = selectedText() || 'link'
      replaceCurrentSelection(`[${text}](https://example.com)`, 1, 1 + text.length)
    },
    image: () => replaceCurrentSelection('![image](./image.png)', 9, 20),
    'horizontal-rule': () => replaceCurrentSelection('\n---\n', 5),
  }

  commands[command]()
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
        }
      })
    }
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

  const selection = normalizeSelectionState(viewState.selectionState)

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
  editorView?.destroy()
  editorView = null
})
</script>

<template>
  <div ref="editorHost" class="source-editor" data-testid="source-editor" />
</template>
