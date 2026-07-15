import { type Editor as CoreEditor, type Extension } from '@tiptap/core'
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
import { resolveVisualImageSource } from '../../domain/markdown/imageRendering'
import { convertVisualImagePath } from '../../infrastructure/tauri/visualImageAssets'
import { RawMarkdownBlock } from './rawMarkdownBlock'

type VisualEditorSetupOptions = {
  element: HTMLDivElement
  content: string
  allowRemoteImages: boolean
  documentPath: string | null
  workspaceRootPath: string | null
  blockControls: Extension
  onRawEdit: () => void
  onRawCollapse: (rawSource: string, position: number) => void
  onKeyDown: (event: KeyboardEvent) => boolean
  onCreate: (editor: CoreEditor) => void
  onSelectionUpdate: (editor: CoreEditor) => void
  onUpdate: (editor: CoreEditor) => void
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
        const message = document.createElement('span')
        message.textContent = resolvedImage.reason
        placeholder.append(title, message)
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
          const placeholder = document.createElement('div')
          placeholder.className = 'visual-image-placeholder visual-image-placeholder-error'
          const title = document.createElement('strong')
          title.textContent = 'Image could not be loaded'
          const message = document.createElement('span')
          message.textContent = source?.trim()
            ? `Folden kept the Markdown unchanged, but the preview failed for ${source.trim()}.`
            : 'Folden kept the Markdown unchanged, but the preview failed.'
          placeholder.append(title, message)
          dom.replaceChildren(placeholder)
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
      update: (updatedNode: { attrs?: { src?: string | null } }) =>
        updatedNode.attrs?.src === source,
    }
  }
}

export function createVisualEditor(options: VisualEditorSetupOptions) {
  const VisualImage = Image.extend({
    addNodeView() {
      return ({ node }) =>
        createImageNodeView(
          node.attrs.src as string | null,
          options.allowRemoteImages,
          options.documentPath,
          options.workspaceRootPath,
        )()
    },
  })

  return new Editor({
    element: options.element,
    content: options.content,
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      VisualImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      RawMarkdownBlock.configure({
        onEdit: options.onRawEdit,
        onCollapse: options.onRawCollapse,
      }),
      options.blockControls,
      Markdown,
    ],
    editorProps: {
      handleKeyDown: (_view, event) => options.onKeyDown(event),
    },
    onCreate: ({ editor }) => options.onCreate(editor),
    onSelectionUpdate: ({ editor }) => options.onSelectionUpdate(editor),
    onUpdate: ({ editor }) => options.onUpdate(editor),
  })
}
