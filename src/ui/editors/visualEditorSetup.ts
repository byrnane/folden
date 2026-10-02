import { t, language } from '../../application/i18n'
import { watch } from 'vue'
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
import { Marked, type marked } from 'marked'
import { resolveVisualImageSource } from '../../domain/markdown/imageRendering'
import { convertVisualImagePath } from '../../infrastructure/tauri/visualImageAssets'
import { RawMarkdownBlock } from './rawMarkdownBlock'

type VisualEditorSetupOptions = {
  element: HTMLDivElement
  content: string
  allowRemoteImages: () => boolean
  documentPath: () => string | null
  workspaceRootPath: () => string | null
  blockControls: Extension
  searchControls: Extension
  onRawEdit: () => void
  onRawCollapse: (rawSource: string, position: number) => void
  onKeyDown: (event: KeyboardEvent) => boolean
  onCreate: (editor: CoreEditor) => void
  onSelectionUpdate: (editor: CoreEditor) => void
  onUpdate: (editor: CoreEditor) => void
}

function createImageNodeView(
  source: string | null,
  alt: string | null,
  context: Pick<
    VisualEditorSetupOptions,
    'allowRemoteImages' | 'documentPath' | 'workspaceRootPath'
  >,
) {
  return () => {
    const dom = document.createElement('div')
    dom.className = 'visual-image-node'
    dom.contentEditable = 'false'
    dom.dataset.imageSource = source ?? ''
    let imageAlt = alt ?? ''

    function renderImage() {
      const resolvedImage = resolveVisualImageSource(
        {
          source,
          documentPath: context.documentPath(),
          workspaceRootPath: context.workspaceRootPath(),
          allowRemoteImages: context.allowRemoteImages(),
        },
        convertVisualImagePath,
      )
      dom.replaceChildren()

      if (resolvedImage.kind === 'placeholder') {
        dom.dataset.imageState = 'placeholder'
        const placeholder = document.createElement('div')
        placeholder.className = 'visual-image-placeholder'
        const title = document.createElement('strong')
        title.textContent = t('Image preview unavailable')
        const message = document.createElement('span')
        message.textContent = t(resolvedImage.reason)
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
      image.alt = imageAlt
      image.loading = 'lazy'
      image.addEventListener(
        'error',
        () => {
          if (image.parentNode !== dom) return
          dom.dataset.imageState = 'error'
          const placeholder = document.createElement('div')
          placeholder.className = 'visual-image-placeholder visual-image-placeholder-error'
          const title = document.createElement('strong')
          title.textContent = t('Image could not be loaded')
          const message = document.createElement('span')
          message.textContent = source?.trim()
            ? `${t('Folden kept the Markdown unchanged, but the preview failed.')} ${source.trim()}`
            : t('Folden kept the Markdown unchanged, but the preview failed.')
          placeholder.append(title, message)
          dom.replaceChildren(placeholder)
        },
        { once: true },
      )
      dom.append(image)
    }

    renderImage()
    const stopContextWatch = watch(
      [context.documentPath, context.workspaceRootPath, context.allowRemoteImages, language],
      renderImage,
    )
    return {
      dom,
      destroy: stopContextWatch,
      update: (updatedNode: { attrs?: { src?: string | null; alt?: string | null } }) => {
        if (updatedNode.attrs?.src !== source) return false
        imageAlt = updatedNode.attrs?.alt ?? ''
        const image = dom.querySelector('img')
        if (image) image.alt = imageAlt
        return true
      },
    }
  }
}

export function createMarkdownExtensions(imageExtension = Image, rawExtension = RawMarkdownBlock) {
  return [
    StarterKit.configure({ link: false }),
    Link.configure({ openOnClick: false, autolink: true }),
    imageExtension.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    rawExtension,
    // Tiptap registers schema tokenizers on this instance. Keeping it local
    // avoids accumulating them across editor mounts and print previews.
    Markdown.configure({ marked: new Marked() as unknown as typeof marked }),
  ]
}

export function createVisualEditor(options: VisualEditorSetupOptions) {
  const VisualImage = Image.extend({
    addNodeView() {
      return ({ node }) =>
        createImageNodeView(
          node.attrs.src as string | null,
          node.attrs.alt as string | null,
          options,
        )()
    },
  })

  return new Editor({
    element: options.element,
    content: options.content,
    contentType: 'markdown',
    extensions: [
      ...createMarkdownExtensions(
        VisualImage,
        RawMarkdownBlock.configure({
          onEdit: options.onRawEdit,
          onCollapse: options.onRawCollapse,
        }),
      ),
      options.blockControls,
      options.searchControls,
    ],
    editorProps: {
      handleKeyDown: (_view, event) => options.onKeyDown(event),
    },
    onCreate: ({ editor }) => options.onCreate(editor),
    onSelectionUpdate: ({ editor }) => options.onSelectionUpdate(editor),
    onUpdate: ({ editor }) => options.onUpdate(editor),
  })
}
