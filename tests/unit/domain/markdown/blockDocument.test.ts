import { describe, expect, it } from 'vitest'
import {
  logicalAnchorAtOffset,
  offsetForLogicalAnchor,
  parseMarkdownBlockDocument,
  reorderMarkdownBlocks,
  replaceMarkdownBlock,
  serializeMarkdownBlockDocument,
  updateMarkdownBlockDocument,
} from '../../../../src/domain/markdown/blockDocument'

describe('Markdown block document', () => {
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
})
