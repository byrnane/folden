<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { createMarkdownExtensions } from '../editors/visualEditorSetup'
import { RawMarkdownBlock } from '../editors/rawMarkdownBlock'
import { buildVisualMarkdownProjection } from '../editors/visualProjection'
import { parseMarkdownBlockDocument } from '../../domain/markdown/blockDocument'
import { resolveVisualImageSource } from '../../domain/markdown/imageRendering'
import { convertVisualImagePath } from '../../infrastructure/tauri/visualImageAssets'
import { t } from '../../application/i18n'
const props = defineProps<{
  snapshot: {
    content: string
    path: string | null
    workspaceRootPath: string | null
    allowRemoteImages: boolean
    isMarkdown: boolean
  }
}>()
const emit = defineEmits<{ close: []; launched: []; error: [message: string] }>()
const html = ref(''),
  root = ref<HTMLElement | null>(null)
const printRaw = RawMarkdownBlock.extend({
  renderHTML({ node }) {
    return ['pre', {}, String(node.attrs.rawSource ?? '')]
  },
})
let generation = 0
function close() {
  emit('close')
}
async function printSnapshot(snapshot: typeof props.snapshot) {
  const current = ++generation
  window.removeEventListener('afterprint', close)
  try {
    if (snapshot.isMarkdown) {
      const printImage = Image.extend({
        renderHTML({ node }) {
          const image = resolveVisualImageSource(
            { source: node.attrs.src, ...snapshot, documentPath: snapshot.path },
            convertVisualImagePath,
          )
          return image.kind === 'image'
            ? ['img', { src: image.renderedSrc, alt: node.attrs.alt ?? '' }]
            : ['p', {}, `${node.attrs.alt ?? ''} (${t('Image preview unavailable')})`]
        },
      })
      const editor = new Editor({
        element: document.createElement('div'),
        extensions: createMarkdownExtensions(printImage, printRaw),
        content: buildVisualMarkdownProjection(
          snapshot.content,
          parseMarkdownBlockDocument(snapshot.content),
        ),
        contentType: 'markdown',
        editable: false,
      })
      html.value = editor.getHTML()
      editor.destroy()
    } else {
      const text = document.createElement('pre')
      text.textContent = snapshot.content
      html.value = text.outerHTML
    }
    await nextTick()
    if (current !== generation) return
    const images = Array.from(root.value?.querySelectorAll('img') ?? [])
    await Promise.race([
      Promise.all([
        document.fonts.ready,
        ...images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.onload = () => resolve()
                image.onerror = () => resolve()
              }),
        ),
      ]),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (current !== generation) return
    for (const image of images)
      if (!image.complete || !image.naturalWidth) {
        const fallback = document.createElement('p')
        fallback.textContent = `${image.alt} (${t('Image preview unavailable')})`
        image.replaceWith(fallback)
      }
    window.addEventListener('afterprint', close, { once: true })
    const result = (window.print as () => void | Promise<void>)()
    if (result && typeof result.then === 'function') {
      await result
      // WKWebView resolves when its print sheet launches and emits no afterprint.
      // Keep the rendered document until afterprint or the next print request.
      if (current === generation) emit('launched')
    }
  } catch (cause) {
    if (current !== generation) return
    emit('error', cause instanceof Error ? cause.message : String(cause))
    close()
  }
}
watch(() => props.snapshot, printSnapshot, { immediate: true })
onBeforeUnmount(() => {
  ++generation
  window.removeEventListener('afterprint', close)
})
</script>
<template>
  <Teleport to="body"><article ref="root" class="folden-print-view" v-html="html" /></Teleport>
</template>
<style>
.folden-print-view {
  display: none;
}
@media print {
  @page {
    size: A4;
    margin: 16mm;
  }
  body > *:not(.folden-print-view) {
    display: none !important;
  }
  body {
    min-height: 0 !important;
    height: auto !important;
    background: white !important;
    color: black !important;
  }
  .folden-print-view {
    display: block;
    font:
      11pt/1.5 'Inter Variable',
      sans-serif;
    color: #111;
    background: #fff;
    overflow-wrap: anywhere;
  }
  .folden-print-view h1,
  .folden-print-view h2,
  .folden-print-view h3,
  .folden-print-view h4,
  .folden-print-view h5,
  .folden-print-view h6 {
    color: #111;
    font-weight: 700;
    margin: 16pt 0 8pt;
    break-after: avoid;
  }
  .folden-print-view h1 {
    font-size: 22pt;
  }
  .folden-print-view h2 {
    font-size: 16pt;
  }
  .folden-print-view h3 {
    font-size: 13pt;
  }
  .folden-print-view img {
    max-width: 100%;
    max-height: 240mm;
    object-fit: contain;
    break-inside: avoid;
  }
  .folden-print-view table {
    border-collapse: collapse;
    width: 100%;
  }
  .folden-print-view td,
  .folden-print-view th {
    border: 1px solid #888;
    padding: 5pt;
    vertical-align: top;
  }
  .folden-print-view pre {
    white-space: pre-wrap;
    background: #f3f3f3;
    padding: 8pt;
    font: 9pt/1.4 monospace;
  }
  .folden-print-view blockquote {
    border-left: 2pt solid #888;
    margin-left: 0;
    padding-left: 10pt;
  }
  .folden-print-view a {
    color: #111;
    text-decoration: underline;
  }
}
</style>
