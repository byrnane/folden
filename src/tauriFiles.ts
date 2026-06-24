import { invoke } from '@tauri-apps/api/core'

export type OpenedDocument = {
  path: string
  content: string
}

export async function openTextFile() {
  return invoke<OpenedDocument | null>('open_text_file')
}

export async function saveTextFile(path: string | null, content: string) {
  return invoke<string | null>('save_text_file', {
    path,
    content,
  })
}
