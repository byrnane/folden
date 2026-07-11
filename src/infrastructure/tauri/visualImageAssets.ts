import { convertFileSrc } from '@tauri-apps/api/core'

export function convertVisualImagePath(filePath: string) {
  if (typeof window === 'undefined') {
    return filePath
  }

  const tauriInternals = (
    window as Window & {
      __TAURI_INTERNALS__?: { convertFileSrc?: (path: string, protocol?: string) => string }
    }
  ).__TAURI_INTERNALS__

  return typeof tauriInternals?.convertFileSrc === 'function' ? convertFileSrc(filePath) : filePath
}
