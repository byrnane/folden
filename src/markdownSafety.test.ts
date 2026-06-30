import { describe, expect, it } from 'vitest'
import {
  analyzeMarkdownSafety,
  isRemoteImageUrl,
  validateImageTarget,
  validateLinkTarget,
} from './markdownSafety'

const unsafeFixtures = [
  {
    name: 'frontmatter',
    source: ['---', 'title: demo', '---', '', 'Body'].join('\n'),
    expectedKinds: ['frontmatter'],
  },
  {
    name: 'table',
    source: ['| a | b |', '| - | - |', '| 1 | 2 |'].join('\n'),
    expectedKinds: ['table'],
  },
  {
    name: 'task list',
    source: '- [x] done',
    expectedKinds: ['task-list'],
  },
  {
    name: 'footnote',
    source: ['Text[^1]', '', '[^1]: note'].join('\n'),
    expectedKinds: ['footnote'],
  },
  {
    name: 'html comment and raw html',
    source: ['<!-- hidden -->', '<div>html</div>'].join('\n'),
    expectedKinds: ['comment', 'html'],
  },
  {
    name: 'custom directive',
    source: [':::note', 'Body', ':::'].join('\n'),
    expectedKinds: ['directive'],
  },
] as const

describe('markdown safety', () => {
  it('accepts a supported markdown subset', () => {
    const report = analyzeMarkdownSafety([
      '# Heading',
      '',
      'Paragraph with **bold** and _italic_.',
      '',
      '- one',
      '  - nested',
      '',
      '1. ordered',
      '',
      '> quote',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '[link](https://example.com)',
      '![image](./image.png)',
      '',
      '---',
    ].join('\n'))

    expect(report.safeForVisualEditing).toBe(true)
    expect(report.unsupportedFeatures).toEqual([])
    expect(report.remoteImages).toEqual([])
  })

  it('flags unsafe fixtures before visual mode can rewrite them', () => {
    for (const fixture of unsafeFixtures) {
      const report = analyzeMarkdownSafety(fixture.source)

      expect(report.safeForVisualEditing, fixture.name).toBe(false)
      expect(
        [...new Set(report.unsupportedFeatures.map((feature) => feature.kind))],
        fixture.name,
      ).toEqual(fixture.expectedKinds)
    }
  })

  it('tracks remote images without blocking visual editing by itself', () => {
    const report = analyzeMarkdownSafety('![remote](https://example.com/a.png)')

    expect(report.safeForVisualEditing).toBe(true)
    expect(report.unsupportedFeatures).toEqual([])
    expect(report.remoteImages).toEqual([{
      line: 1,
      source: 'https://example.com/a.png',
    }])
  })

  it('rejects dangerous link schemes while allowing remote image placeholders', () => {
    expect(validateLinkTarget('javascript:alert(1)')).toBe('javascript: links are not allowed.')
    expect(validateLinkTarget('vscode://settings')).toBe('This link scheme is not allowed.')
    expect(validateLinkTarget('./notes.md')).toBeNull()
    expect(validateImageTarget('https://example.com/a.png')).toBeNull()
    expect(validateImageTarget('./image.png')).toBeNull()
    expect(isRemoteImageUrl('https://example.com/a.png')).toBe(true)
  })
})
