import { describe, expect, it } from 'vitest'
import { parseMarkdownBlockDocument } from '../../../../src/domain/markdown/blockDocument'
import { buildVisualMarkdownProjection } from '../../../../src/ui/editors/visualProjection'

describe('visual Markdown projection', () => {
  it('replaces unsupported blocks with lossless source markers', () => {
    const source = '---\ntitle: Привет\n---\n\n# Heading\n'
    const document = parseMarkdownBlockDocument(source)
    const projection = buildVisualMarkdownProjection(source, document)

    expect(projection).toContain(':::folden-raw frontmatter ')
    expect(projection).not.toContain('title: Привет')
    expect(projection).toContain('# Heading')
  })

  it('keeps plain source when no matching block document exists', () => {
    expect(buildVisualMarkdownProjection('text', null)).toBe('text')
  })

  it('retains definitions for reference resolution and gives them a visible source block', () => {
    const source = '[link][ref]\n\n[ref]: https://example.com\n\nTail\n'
    const projection = buildVisualMarkdownProjection(source, parseMarkdownBlockDocument(source))
    expect(projection).toContain('[ref]: https://example.com')
    expect(projection).toContain(':::folden-raw reference ')
  })
})
