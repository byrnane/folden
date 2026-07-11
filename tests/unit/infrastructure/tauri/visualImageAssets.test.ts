import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (filePath: string) => `asset://${filePath}`,
}))

import { convertVisualImagePath } from '../../../../src/infrastructure/tauri/visualImageAssets'

describe('visual image asset adapter', () => {
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('keeps paths unchanged outside a browser runtime', () => {
    expect(convertVisualImagePath('C:\\Docs\\image.png')).toBe('C:\\Docs\\image.png')
  })

  it('converts local paths when the Tauri asset protocol is available', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        __TAURI_INTERNALS__: {
          convertFileSrc: () => 'asset-ready',
        },
      },
      configurable: true,
    })

    expect(convertVisualImagePath('C:\\Docs\\image.png')).toBe('asset://C:\\Docs\\image.png')
  })
})
