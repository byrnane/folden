import { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

const fixtures = [
  '# Heading\n\nParagraph text.',
  'Text with **bold**, *italic*, ~~strike~~, and `code`.',
  '- one\n  - nested\n- three',
  '1. first\n2. second',
  '> Quote line',
  '```ts\nconst answer = 42\n```',
  '[link](https://example.com)',
  '![image](./image.png)',
  '---',
  'Unicode: Привет, мир',
  'Line one\r\n\r\nLine two',
]

function roundTripMarkdown(source: string) {
  const editor = new Editor({
    content: source,
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Markdown,
    ],
  })

  const output = editor.getMarkdown()
  editor.destroy()
  return output.replaceAll('\r\n', '\n').trim()
}

describe('markdown round trip', () => {
  it('preserves supported fixtures within whitespace tolerance', () => {
    for (const fixture of fixtures) {
      expect(roundTripMarkdown(fixture)).toBe(fixture.replaceAll('\r\n', '\n').trim())
    }
  })
})
