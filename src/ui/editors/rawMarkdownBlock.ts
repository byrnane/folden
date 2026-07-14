import { Node, mergeAttributes } from '@tiptap/core'
import type { RawMarkdownKind } from '../../domain/markdown/blockDocument'

const markerName = 'folden-raw'

function encodeSource(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeSource(value: string) {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function rawMarkdownMarker(kind: RawMarkdownKind, source: string) {
  return `:::${markerName} ${kind} ${encodeSource(source)}:::\n`
}

export const RawMarkdownBlock = Node.create<{
  onEdit: () => void
  onCollapse: (rawSource: string, position: number) => void
}>({
  name: 'rawMarkdownBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { onEdit: () => undefined, onCollapse: () => undefined }
  },

  addAttributes() {
    return {
      rawKind: { default: 'unknown' },
      rawSource: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-raw-markdown-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-raw-markdown-block': '',
        class: 'raw-markdown-block',
      }),
    ]
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode('rawMarkdownBlock', token.attributes ?? {}, []),

  renderMarkdown: (node) => String(node.attrs?.rawSource ?? ''),

  markdownTokenizer: {
    name: 'rawMarkdownBlock',
    level: 'block',
    start(source) {
      return source.indexOf(`:::${markerName} `)
    },
    tokenize(source) {
      const match = /^:::folden-raw ([a-z-]+) ([A-Za-z0-9+/=]+):::(?:\r?\n|$)/u.exec(source)
      if (!match) return undefined
      return {
        type: 'rawMarkdownBlock',
        raw: match[0],
        attributes: {
          rawKind: match[1],
          rawSource: decodeSource(match[2]),
        },
      }
    },
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('section')
      dom.className = 'raw-markdown-block'
      dom.dataset.rawMarkdownBlock = ''
      dom.contentEditable = 'false'

      const header = document.createElement('button')
      header.type = 'button'
      header.className = 'raw-markdown-block-header'

      const type = document.createElement('strong')
      type.textContent = 'Source block'
      const kind = document.createElement('span')
      kind.className = 'raw-markdown-block-kind'
      const preview = document.createElement('code')
      preview.className = 'raw-markdown-block-preview'
      header.append(type, kind, preview)

      const editorField = document.createElement('textarea')
      editorField.className = 'raw-markdown-block-editor'
      editorField.setAttribute('aria-label', 'Edit raw Markdown block')
      editorField.hidden = true

      function render(nextNode = node) {
        const rawSource = String(nextNode.attrs.rawSource ?? '')
        kind.textContent = String(nextNode.attrs.rawKind ?? 'unknown')
        preview.textContent = rawSource.trim().replace(/\s+/gu, ' ').slice(0, 120) || 'Empty block'
        if (document.activeElement !== editorField) editorField.value = rawSource
      }

      header.addEventListener('click', () => {
        editorField.hidden = !editorField.hidden
        dom.classList.toggle('raw-markdown-block-expanded', !editorField.hidden)
        if (!editorField.hidden) editorField.focus()
      })
      editorField.addEventListener('input', () => {
        const position = typeof getPos === 'function' ? getPos() : undefined
        if (typeof position !== 'number') return
        this.options.onEdit()
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(position, undefined, {
            ...node.attrs,
            rawSource: editorField.value,
          }),
        )
      })
      editorField.addEventListener('blur', () => {
        editorField.hidden = true
        dom.classList.remove('raw-markdown-block-expanded')
        const position = typeof getPos === 'function' ? getPos() : undefined
        if (typeof position === 'number') {
          this.options.onCollapse(editorField.value, position)
        }
      })

      dom.append(header, editorField)
      render()
      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'rawMarkdownBlock') return false
          node = updatedNode
          render(updatedNode)
          return true
        },
        stopEvent(event) {
          return event.target === header || event.target === editorField
        },
      }
    }
  },
})
