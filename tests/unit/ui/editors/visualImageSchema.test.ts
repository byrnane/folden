import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { parseMarkdownBlockDocument } from '../../../../src/domain/markdown/blockDocument'
import { createMarkdownExtensions } from '../../../../src/ui/editors/visualEditorSetup'
import { buildVisualMarkdownProjection } from '../../../../src/ui/editors/visualProjection'

describe('Visual image schema', () => {
  for (const [name, source] of [
    ['block image', '![image](./image.png)\n'],
    ['reference image', '![image][ref]\n\n[ref]: ./image.png\n'],
    ['mixed paragraph', 'Original content.\n![image](./image.png)\n'],
    ['linked image', '[![image](./image.png)](target.md)\n'],
    ['formatted image', 'text **![image](./image.png)**\n'],
    ['list image', '- text ![image](./image.png)\n'],
    ['table image', '| Cell |\n| --- |\n| ![image](./image.png) |\n'],
    ['heading image', '# Text ![image](./image.png)\n'],
    ['list block image', '- text\n\n  ![image](./image.png)\n'],
    ['quote block image', '> ![image](./image.png)\n'],
    ['consecutive block images', '![image](./image.png)\n![second](./second.png)\n'],
    ['separate block images', '![image](./image.png)\n\n![second](./second.png)\n'],
  ]) {
    it(`keeps ${name} valid through the shared Visual projection`, () => {
      const extensions = createMarkdownExtensions()
      const markdown = extensions.find(
        (extension) => extension.name === 'markdown',
      ) as typeof Markdown
      const manager = new MarkdownManager({
        extensions,
        marked: markdown.options.marked,
      })
      const schema = getSchema(extensions)
      const blockDocument = parseMarkdownBlockDocument(source)
      let originallyValid = false
      try {
        schema.nodeFromJSON(manager.parse(source)).check()
        originallyValid = true
      } catch {
        // Unsupported inline images need the lossless raw projection.
      }
      if (originallyValid) {
        expect(
          blockDocument.blocks
            .filter((block) => block.rawKind !== 'reference')
            .every((block) => block.kind !== 'raw'),
        ).toBe(true)
      }
      const projection = buildVisualMarkdownProjection(source, blockDocument)
      const document = schema.nodeFromJSON(manager.parse(projection))
      expect(() => document.check()).not.toThrow()
    })
  }
})
