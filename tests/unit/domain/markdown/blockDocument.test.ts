import { describe, expect, it } from 'vitest'
import { marked } from 'marked'
import {
  assertMarkdownBlockDocument,
  logicalAnchorAtOffset,
  offsetForLogicalAnchor,
  parseMarkdownBlockDocument,
  reorderMarkdownBlocks,
  replaceMarkdownBlock,
  serializeMarkdownBlockDocument,
  updateMarkdownBlockDocument,
} from '../../../../src/domain/markdown/blockDocument'

describe('Markdown block document', () => {
  it('ignores editor tokenizers registered on the global Marked instance', () => {
    const previousOptions = { ...marked.defaults }
    let calls = 0
    try {
      marked.use({
        extensions: [
          {
            name: 'editor-only-probe',
            level: 'block',
            tokenizer() {
              calls += 1
              return undefined
            },
          },
        ],
      })
      const document = parseMarkdownBlockDocument('# Heading\n\nParagraph.\n')
      expect(document.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph'])
      expect(calls).toBe(0)
    } finally {
      marked.setOptions(previousOptions)
    }
  })

  const kitchenSink = [
    '---',
    'title: Draft',
    '---',
    '',
    '# Heading',
    '',
    'Paragraph with **formatting**.',
    '',
    '<!-- keep this -->',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
  ].join('\n')

  it('round-trips untouched Markdown exactly and exposes raw blocks', () => {
    const document = parseMarkdownBlockDocument(kitchenSink)

    expect(serializeMarkdownBlockDocument(document)).toBe(kitchenSink)
    expect(document.blocks.map((block) => [block.kind, block.rawKind])).toEqual([
      ['raw', 'frontmatter'],
      ['heading', null],
      ['paragraph', null],
      ['raw', 'comment'],
      ['table', null],
    ])
  })

  it('round-trips lexical edge cases exactly', () => {
    const fixtures = [
      '\ufeff# Heading\r\n\r\nParagraph with trailing spaces.  \r\n',
      '# Heading\n\n\n\nParagraph with trailing tab.\t \n\n',
      '---\ntitle: Draft\n---\n\n<!-- keep -->\n\n:::note\nBody\n:::\n',
      '````md\n```ts\nconst answer = 42\n```\n````\n',
      '~~~ts\nconst unfinished = true\n',
    ]

    for (const source of fixtures) {
      const document = parseMarkdownBlockDocument(source)
      expect(serializeMarkdownBlockDocument(document)).toBe(source)
      expect(() => assertMarkdownBlockDocument(document)).not.toThrow()
    }
  })

  it('changes one block without rewriting its neighbors', () => {
    const document = parseMarkdownBlockDocument(kitchenSink)
    const paragraph = document.blocks.find((block) => block.kind === 'paragraph')!
    const next = replaceMarkdownBlock(document, paragraph.id, 'Changed paragraph.\n\n')

    expect(next.source).toContain('title: Draft')
    expect(next.source).toContain('<!-- keep this -->')
    expect(next.source).toContain('Changed paragraph.')
    expect(next.blocks.find((block) => block.id === paragraph.id)?.state).toBe('changed')
  })

  it('maps source offsets through stable logical block anchors', () => {
    const document = parseMarkdownBlockDocument(kitchenSink)
    const offset = kitchenSink.indexOf('formatting')
    const anchor = logicalAnchorAtOffset(document, offset)!

    expect(offsetForLogicalAnchor(document, anchor)).toBe(offset)
  })

  it('reorders whole blocks without changing their raw source', () => {
    const document = parseMarkdownBlockDocument('# One\n\nParagraph.\n\n> Quote\n')
    const quote = document.blocks[2]
    const next = reorderMarkdownBlocks(document, [quote.id], 0)

    expect(next.source).toBe('> Quote\n# One\n\nParagraph.\n\n')
  })

  it('keeps unsupported inline syntax as a source block', () => {
    const document = parseMarkdownBlockDocument('Text with <mark>raw HTML</mark>.\n')
    expect(document.blocks[0]).toMatchObject({ kind: 'raw', rawKind: 'html', state: 'raw' })
  })

  it('preserves paragraphs mixing text and block images as raw source', () => {
    for (const source of [
      'Original content.\n![image](./image.png)\n',
      'Original content. ![image](./image.png)\n',
      'Original content.\n![image][ref]\n\n[ref]: ./image.png\n',
    ]) {
      const document = parseMarkdownBlockDocument(source)
      expect(document.blocks[0]).toMatchObject({ kind: 'raw', rawKind: 'unknown' })
      expect(serializeMarkdownBlockDocument(document)).toBe(source)
    }
    for (const source of [
      '![image](./image.png)\n',
      '![image][ref]\n\n[ref]: ./image.png\n',
      '![image](./image.png)\n\nOriginal content.\n',
    ]) {
      expect(parseMarkdownBlockDocument(source).blocks[0].kind).toBe('image')
    }
  })

  it('keeps a whole multiline paragraph raw when a later line has unsupported inline syntax', () => {
    const document = parseMarkdownBlockDocument('First line\nSecond <mark>raw</mark> line\n')

    expect(document.blocks).toHaveLength(1)
    expect(document.blocks[0]).toMatchObject({ kind: 'raw', rawKind: 'html', state: 'raw' })
  })

  it('reparses only the changed block and neighboring boundaries', () => {
    const source = 'First\n\nSecond\n\nThird\n\nFourth\n'
    const document = parseMarkdownBlockDocument(source)
    const from = source.indexOf('Second')
    const nextSource = source.replace('Second', 'Changed')
    const updated = updateMarkdownBlockDocument(document, nextSource, {
      from,
      to: from + 'Second'.length,
      insert: 'Changed',
    })

    expect(serializeMarkdownBlockDocument(updated)).toBe(nextSource)
    expect(updated.blocks.at(-1)?.id).toBe(document.blocks.at(-1)?.id)
    expect(updated.blocks[1].rawSource).toContain('Changed')
  })

  it('does not treat an interior divider as frontmatter during incremental reparse', () => {
    const source = 'First\n\n---\n\nSecond\n\nThird\n'
    const document = parseMarkdownBlockDocument(source)
    const from = source.indexOf('Second')
    const nextSource = source.replace('Second', 'Changed')
    const updated = updateMarkdownBlockDocument(document, nextSource, {
      from,
      to: from + 'Second'.length,
      insert: 'Changed',
    })

    expect(updated.blocks.map((block) => block.kind)).toEqual([
      'paragraph',
      'divider',
      'paragraph',
      'paragraph',
    ])
    expect(serializeMarkdownBlockDocument(updated)).toBe(nextSource)
  })

  it('falls back to a full reparse when an open fence crosses the local window', () => {
    const source = 'One\n\nTwo\n\nThree\n\nFour\n'
    const document = parseMarkdownBlockDocument(source)
    const from = source.indexOf('Two')
    const nextSource = `${source.slice(0, from)}\`\`\`\n${source.slice(from)}`
    const updated = updateMarkdownBlockDocument(document, nextSource, {
      from,
      to: from,
      insert: '```\n',
    })

    expect(updated.blocks.map((block) => block.kind)).toEqual(['paragraph', 'code-block'])
    expect(updated.blocks[1].rawSource).toContain('Four')
  })

  it('round-trips whitespace-only Markdown exactly', () => {
    const source = '\ufeff  \r\n\r\n'
    const document = parseMarkdownBlockDocument(source)

    expect(serializeMarkdownBlockDocument(document)).toBe(source)
    expect(() => assertMarkdownBlockDocument(document)).not.toThrow()
  })

  it('groups nested and continued lists using Markdown token boundaries', () => {
    for (const source of [
      '- first\n  - nested\n- final\n\nTail\n',
      '- first\n\n  continuation\n- final\n\nTail\n',
    ]) {
      const document = parseMarkdownBlockDocument(source)
      expect(document.blocks.map((block) => block.kind)).toEqual(['bullet-list', 'paragraph'])
      expect(serializeMarkdownBlockDocument(document)).toBe(source)
    }
  })

  it('keeps reference definitions as source blocks without confusing autolinks or setext headings', () => {
    const document = parseMarkdownBlockDocument(
      '[link][ref]\n\n[ref]: https://example.com\n\n<https://example.com>\n\nHeading\n===\n',
    )
    expect(document.blocks.map((block) => [block.kind, block.rawKind])).toEqual([
      ['paragraph', null],
      ['raw', 'reference'],
      ['paragraph', null],
      ['heading', null],
    ])
    expect(parseMarkdownBlockDocument('---\n\nBody\n').blocks[0].kind).toBe('divider')
  })

  it('keeps repeated block ids stable when inserting an identical block before them', () => {
    const source = 'Same\n\nSame\n\nSame\n'
    const document = parseMarkdownBlockDocument(source)
    const insertion = document.blocks[1].from
    const insert = 'Same\n\n'
    const updated = updateMarkdownBlockDocument(
      document,
      `${source.slice(0, insertion)}${insert}${source.slice(insertion)}`,
      { from: insertion, to: insertion, insert },
    )

    expect(new Set(updated.blocks.map((block) => block.id))).toHaveProperty(
      'size',
      updated.blocks.length,
    )
    expect(updated.blocks[0].id).toBe(document.blocks[0].id)
    expect(updated.blocks[2].id).toBe(document.blocks[1].id)
    expect(updated.blocks[3].id).toBe(document.blocks[2].id)
    expect(updated.blocks[1].id).not.toBe(document.blocks[1].id)
    expect(() => assertMarkdownBlockDocument(updated)).not.toThrow()
  })

  it('keeps repeated block ids stable when inserting after and deleting the middle block', () => {
    const source = 'Same\n\nSame\n\nSame\n'
    const document = parseMarkdownBlockDocument(source)
    const insertion = document.blocks[1].to
    const insert = 'Same\n\n'
    const inserted = updateMarkdownBlockDocument(
      document,
      `${source.slice(0, insertion)}${insert}${source.slice(insertion)}`,
      { from: insertion, to: insertion, insert },
    )

    expect(inserted.blocks[0].id).toBe(document.blocks[0].id)
    expect(inserted.blocks[1].id).toBe(document.blocks[1].id)
    expect(inserted.blocks[3].id).toBe(document.blocks[2].id)
    expect(inserted.blocks[2].id).not.toBe(document.blocks[2].id)

    const removed = document.blocks[1]
    const deletedSource = `${source.slice(0, removed.from)}${source.slice(removed.to)}`
    const deleted = updateMarkdownBlockDocument(document, deletedSource, {
      from: removed.from,
      to: removed.to,
      insert: '',
    })
    expect(deleted.blocks.map((block) => block.id)).toEqual([
      document.blocks[0].id,
      document.blocks[2].id,
    ])
  })

  it('keeps the edited repeated block identity and rejects corrupt documents', () => {
    const source = 'Same\n\nSame\n\nSame\n'
    const document = parseMarkdownBlockDocument(source)
    const middle = document.blocks[1]
    const from = middle.contentFrom
    const nextSource = `${source.slice(0, from)}Changed${source.slice(from + 4)}`
    const updated = updateMarkdownBlockDocument(document, nextSource, {
      from,
      to: from + 4,
      insert: 'Changed',
    })

    expect(updated.blocks.map((block) => block.id)).toEqual(
      document.blocks.map((block) => block.id),
    )
    const corrupt = {
      ...updated,
      blocks: updated.blocks.map((block, index) =>
        index === 1 ? { ...block, id: updated.blocks[0].id } : block,
      ),
    }
    expect(() => assertMarkdownBlockDocument(corrupt)).toThrow('Block Document invariant failed')
  })

  it('keeps block identity when an edit changes its kind at the block boundary', () => {
    const source = 'Paragraph\n\nNext\n'
    const document = parseMarkdownBlockDocument(source)
    const nextSource = `# ${source}`
    const updated = updateMarkdownBlockDocument(document, nextSource, {
      from: 0,
      to: 0,
      insert: '# ',
    })

    expect(updated.blocks[0].kind).toBe('heading')
    expect(updated.blocks[0].id).toBe(document.blocks[0].id)
    expect(updated.blocks[1].id).toBe(document.blocks[1].id)
  })
})
