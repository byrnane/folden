import { describe, expect, it } from 'vitest'
import {
  MAX_DOCUMENT_MAP_SEGMENTS,
  buildDocumentMapLines,
  extractMarkdownHeadings,
  findActiveHeading,
  findActiveHeadingByLine,
} from '../../../../src/domain/markdown/outline'

describe('markdown outline', () => {
  it('extracts headings and ignores fenced code blocks', () => {
    expect(
      extractMarkdownHeadings(
        ['# Title', '```', '# Ignored', '```', '## Section', '###### Deep'].join('\n'),
      ),
    ).toEqual([
      { id: 'title', level: 1, text: 'Title', line: 1 },
      { id: 'section', level: 2, text: 'Section', line: 5 },
      { id: 'deep', level: 6, text: 'Deep', line: 6 },
    ])
  })

  it('keeps duplicate heading ids stable', () => {
    expect(extractMarkdownHeadings('# Same\n## Same').map((heading) => heading.id)).toEqual([
      'same',
      'same-1',
    ])
  })

  it('ignores empty headings and supports tilde fences', () => {
    expect(
      extractMarkdownHeadings(['#', '~~~', '## Hidden', '~~~', '### Visible ###'].join('\n')),
    ).toEqual([{ id: 'visible', level: 3, text: 'Visible', line: 5 }])
  })

  it('builds a map for every non-empty document', () => {
    expect(buildDocumentMapLines('Short\nfile')).toHaveLength(2)
    expect(buildDocumentMapLines('')).toEqual([])

    const lines = buildDocumentMapLines(
      ['# Heading', '  - List item', '', ...Array.from({ length: 22 }, () => 'Paragraph')].join(
        '\n',
      ),
    )

    expect(lines.slice(0, 3)).toEqual([
      expect.objectContaining({ kind: 'heading', width: 92 }),
      expect.objectContaining({ kind: 'list', indent: 6 }),
      expect.objectContaining({ kind: 'empty' }),
    ])
  })

  it('bounds large document maps while preserving document positions', () => {
    const lines = buildDocumentMapLines(
      Array.from({ length: 50_000 }, (_, index) =>
        index % 100 === 0 ? `# ${index}` : 'text',
      ).join('\n'),
    )
    expect(lines).toHaveLength(MAX_DOCUMENT_MAP_SEGMENTS)
    expect(lines[0].position).toBe(0)
    expect(lines.at(-1)!.position).toBeGreaterThan(0.99)
  })

  it('selects the last heading above the viewport', () => {
    const headings = extractMarkdownHeadings('# First\nText\n## Second\nText\n### Third')

    expect(findActiveHeading(headings, { first: 0, second: 120, third: 260 }, 140)).toBe('second')
    expect(findActiveHeading(headings, { first: 40, second: 160, third: 260 }, 0)).toBe('first')
  })

  it('selects the active heading by source line without layout positions', () => {
    const headings = extractMarkdownHeadings('# First\nText\n## Second\nText\n### Third')
    expect(findActiveHeadingByLine(headings, 4)).toBe('second')
    expect(findActiveHeadingByLine(headings, 1)).toBe('first')
  })
})
