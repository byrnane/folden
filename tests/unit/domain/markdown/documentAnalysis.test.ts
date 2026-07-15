import { describe, expect, it } from 'vitest'
import {
  analyzeDocument,
  countDocumentWords,
} from '../../../../src/domain/markdown/documentAnalysis'
import { MAX_DOCUMENT_MAP_SEGMENTS } from '../../../../src/domain/markdown/outline'

describe('document analysis', () => {
  it('returns headings, bounded map segments and word count in one result', () => {
    const content = ['# Title', 'two words', ...Array.from({ length: 600 }, () => 'line')].join(
      '\n',
    )
    const result = analyzeDocument({ documentId: 'doc', revision: 3, content, isMarkdown: true })
    expect(result.documentId).toBe('doc')
    expect(result.revision).toBe(3)
    expect(result.headings).toEqual([{ id: 'title', level: 1, text: 'Title', line: 1 }])
    expect(result.mapSegments).toHaveLength(MAX_DOCUMENT_MAP_SEGMENTS)
    expect(result.wordCount).toBe(604)
  })

  it('supports unicode whitespace and plain text documents', () => {
    expect(countDocumentWords('one\u00a0two\nthree')).toBe(3)
    const result = analyzeDocument({
      documentId: 'plain',
      revision: 1,
      content: '# not a heading',
      isMarkdown: false,
    })
    expect(result.headings).toEqual([])
    expect(result.mapSegments).toEqual([])
    expect(result.wordCount).toBe(4)
  })
})
