import { describe, expect, it } from 'vitest'
import { extractMarkdownHeadings } from '../../../../src/domain/markdown/outline'

describe('markdown outline', () => {
  it('extracts headings and ignores fenced code blocks', () => {
    expect(extractMarkdownHeadings([
      '# Title',
      '```',
      '# Ignored',
      '```',
      '## Section',
      '###### Deep',
    ].join('\n'))).toEqual([
      { id: 'title', level: 1, text: 'Title', line: 1 },
      { id: 'section', level: 2, text: 'Section', line: 5 },
      { id: 'deep', level: 6, text: 'Deep', line: 6 },
    ])
  })

  it('keeps duplicate heading ids stable', () => {
    expect(extractMarkdownHeadings('# Same\n## Same').map((heading) => heading.id)).toEqual(['same', 'same-1'])
  })

  it('ignores empty headings and supports tilde fences', () => {
    expect(extractMarkdownHeadings([
      '#',
      '~~~',
      '## Hidden',
      '~~~',
      '### Visible ###',
    ].join('\n'))).toEqual([
      { id: 'visible', level: 3, text: 'Visible', line: 5 },
    ])
  })
})
