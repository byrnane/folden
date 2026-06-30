import { describe, expect, it, vi } from 'vitest'
import { resolveRelativeImagePath, resolveVisualImageSource } from './imageRendering'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (filePath: string) => `asset://${filePath}`,
}))

describe('image rendering', () => {
  it('converts local workspace images into controlled asset URLs', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        __TAURI_INTERNALS__: {
          convertFileSrc: () => 'asset-ready',
        },
      },
      configurable: true,
    })

    expect(resolveVisualImageSource({
      source: './image.png',
      documentPath: 'C:\\Docs\\notes\\daily.md',
      workspaceRootPath: 'C:\\Docs',
      allowRemoteImages: false,
    })).toEqual({
      kind: 'image',
      renderedSrc: 'asset://C:\\Docs\\notes\\image.png',
    })
  })

  it('resolves document-relative and workspace-root image paths', () => {
    expect(resolveRelativeImagePath('./cover.png', 'C:\\Docs\\notes\\daily.md', 'C:\\Docs')).toBe(
      'C:\\Docs\\notes\\cover.png',
    )
    expect(resolveRelativeImagePath('../shared/cover.png', 'C:\\Docs\\notes\\daily.md', 'C:\\Docs')).toBe(
      'C:\\Docs\\shared\\cover.png',
    )
    expect(resolveRelativeImagePath('/images/logo.png', 'C:\\Docs\\notes\\daily.md', 'C:\\Docs')).toBe(
      'C:\\Docs\\images\\logo.png',
    )
  })

  it('keeps remote images blocked until explicitly allowed', () => {
    expect(resolveVisualImageSource({
      source: 'https://example.com/image.png',
      documentPath: 'C:\\Docs\\notes\\daily.md',
      workspaceRootPath: 'C:\\Docs',
      allowRemoteImages: false,
    })).toEqual({
      kind: 'placeholder',
      reason: 'Remote image is blocked. Use Load remote images for this document.',
    })

    expect(resolveVisualImageSource({
      source: 'https://example.com/image.png',
      documentPath: 'C:\\Docs\\notes\\daily.md',
      workspaceRootPath: 'C:\\Docs',
      allowRemoteImages: true,
    })).toEqual({
      kind: 'image',
      renderedSrc: 'https://example.com/image.png',
    })
  })

  it('shows a placeholder when a relative image cannot be resolved safely', () => {
    expect(resolveVisualImageSource({
      source: './image.png',
      documentPath: null,
      workspaceRootPath: null,
      allowRemoteImages: false,
    })).toEqual({
      kind: 'placeholder',
      reason: 'Save the document inside a workspace to preview this local image.',
    })
  })
})
