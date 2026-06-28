import { describe, expect, it } from 'vitest'
import {
  analyzeMarkdownSafety,
  isRemoteImageUrl,
  validateImageTarget,
  validateLinkTarget,
} from './markdownSafety'

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
  })

  it('flags unsupported constructs conservatively', () => {
    const report = analyzeMarkdownSafety([
      '---',
      'title: demo',
      '---',
      '',
      '| a | b |',
      '| - | - |',
      '- [x] task',
      '[^1]: footnote',
      '<div>html</div>',
      ':::note',
      '![remote](https://example.com/a.png)',
    ].join('\n'))

    expect(report.safeForVisualEditing).toBe(false)
    expect(report.unsupportedFeatures.map((feature) => feature.kind)).toEqual([
      'frontmatter',
      'table',
      'task-list',
      'footnote',
      'html',
      'directive',
      'remote-image',
    ])
  })

  it('rejects dangerous link schemes and remote image targets', () => {
    expect(validateLinkTarget('javascript:alert(1)')).toBe('javascript: links are not allowed.')
    expect(validateLinkTarget('vscode://settings')).toBe('This link scheme is not allowed.')
    expect(validateLinkTarget('./notes.md')).toBeNull()
    expect(validateImageTarget('https://example.com/a.png')).toBe(
      'Remote images are disabled in Visual mode for this release.',
    )
    expect(validateImageTarget('./image.png')).toBeNull()
    expect(isRemoteImageUrl('https://example.com/a.png')).toBe(true)
  })
})
