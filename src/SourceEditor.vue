<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DocumentUpdate } from './editorSync'

const props = defineProps<{
  documentId: string
  viewId: string
  modelValue: string
  revision: number
}>()

const emit = defineEmits<{
  'document-update': [update: DocumentUpdate]
}>()

const editorHost = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let lastAppliedRevision = props.revision
let isApplyingExternalContent = false

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
      EditorView.lineWrapping,
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

defineExpose({
  flushContent,
})

onBeforeUnmount(() => {
  editorView?.destroy()
  editorView = null
})
</script>

<template>
  <div ref="editorHost" class="source-editor" />
</template>
