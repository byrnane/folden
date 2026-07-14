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
})
