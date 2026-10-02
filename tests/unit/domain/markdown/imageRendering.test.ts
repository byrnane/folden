import { describe, expect, it } from 'vitest'
import {
  resolveRelativeImagePath,
  resolveVisualImageSource,
} from '../../../../src/domain/markdown/imageRendering'

describe('image rendering', () => {
  it('resolves POSIX and UNC images without losing the filesystem root', () => {
    expect(
      resolveRelativeImagePath(
        '../shared/cover%20one.png#preview',
        '/home/Max/Notes/daily.md',
        '/home/Max',
      ),
    ).toBe('/home/Max/shared/cover one.png#preview')
    expect(
      resolveRelativeImagePath('/images/logo.png', '/Users/Max/Notes/daily.md', '/Users/Max'),
    ).toBe('/Users/Max/images/logo.png')
    expect(resolveRelativeImagePath('cover.png', '/daily.md', '/')).toBe('/cover.png')
    expect(
      resolveRelativeImagePath(
        '../cover.png',
        '\\\\server\\share\\notes\\daily.md',
        '\\\\server\\share',
      ),
    ).toBe('\\\\server\\share\\cover.png')
  })
  it('converts local workspace images into controlled asset URLs', () => {
    expect(
      resolveVisualImageSource(
        {
          source: './image.png',
          documentPath: 'C:\\Docs\\notes\\daily.md',
          workspaceRootPath: 'C:\\Docs',
          allowRemoteImages: false,
        },
        (path) => `asset://${path}`,
      ),
    ).toEqual({
      kind: 'image',
      renderedSrc: 'asset://C:\\Docs\\notes\\image.png',
    })
  })

  it('resolves document-relative and workspace-root image paths', () => {
    expect(resolveRelativeImagePath('./cover.png', 'C:\\Docs\\notes\\daily.md', 'C:\\Docs')).toBe(
      'C:\\Docs\\notes\\cover.png',
    )
    expect(
      resolveRelativeImagePath('../shared/cover.png', 'C:\\Docs\\notes\\daily.md', 'C:\\Docs'),
    ).toBe('C:\\Docs\\shared\\cover.png')
    expect(
      resolveRelativeImagePath('/images/logo.png', 'C:\\Docs\\notes\\daily.md', 'C:\\Docs'),
    ).toBe('C:\\Docs\\images\\logo.png')
  })

  it('keeps remote images blocked until explicitly allowed', () => {
    expect(
      resolveVisualImageSource({
        source: 'https://example.com/image.png',
        documentPath: 'C:\\Docs\\notes\\daily.md',
        workspaceRootPath: 'C:\\Docs',
        allowRemoteImages: false,
      }),
    ).toEqual({
      kind: 'placeholder',
      reason: 'Remote image is blocked. Use Load remote images for this document.',
    })

    expect(
      resolveVisualImageSource({
        source: 'https://example.com/image.png',
        documentPath: 'C:\\Docs\\notes\\daily.md',
        workspaceRootPath: 'C:\\Docs',
        allowRemoteImages: true,
      }),
    ).toEqual({
      kind: 'image',
      renderedSrc: 'https://example.com/image.png',
    })
  })

  it('decodes image asset URLs with spaces and Cyrillic names exactly once', () => {
    expect(
      resolveRelativeImagePath(
        '%D0%A1%D1%86%D0%B5%D0%BD%D0%B0%20%D0%B8%D0%B3%D1%80%D1%8B.assets/%D0%BA%D0%B0%D0%B4%D1%80%201.png',
        'C:\\Docs\\Сцена игры.md',
        null,
      ),
    ).toBe('C:\\Docs\\Сцена игры.assets\\кадр 1.png')
    expect(resolveRelativeImagePath('draft.assets/100%25.png', 'C:\\Docs\\draft.md', null)).toBe(
      'C:\\Docs\\draft.assets\\100%.png',
    )
    expect(
      resolveRelativeImagePath('draft.assets/bad%xy.png', 'C:\\Docs\\draft.md', null),
    ).toBeNull()
  })

  it('shows a placeholder when a relative image cannot be resolved safely', () => {
    expect(
      resolveVisualImageSource({
        source: './image.png',
        documentPath: null,
        workspaceRootPath: null,
        allowRemoteImages: false,
      }),
    ).toEqual({
      kind: 'placeholder',
      reason: 'Save the document inside a workspace to preview this local image.',
    })
  })
})
