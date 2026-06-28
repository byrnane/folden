import { invoke } from '@tauri-apps/api/core'

export type WorkspaceEntry = {
  name: string
  path: string
  kind: 'directory' | 'file'
  children: WorkspaceEntry[]
}

export type OpenedDocument = {
  path: string
  content: string
}

export async function openTextFile() {
  return invoke<OpenedDocument | null>('open_text_file')
}

export async function saveTextFile(
  path: string | null,
  content: string,
  suggestedFileName?: string,
) {
  return invoke<string | null>('save_text_file', {
    path,
    content,
    suggestedFileName,
  })
}

export async function openWorkspaceDirectory() {
  return invoke<string | null>('open_workspace_directory')
}

export async function listDirectory(root: string, path: string) {
  return invoke<WorkspaceEntry[]>('list_directory', {
    root,
    path,
  })
}

export async function openTextFileByPath(root: string, path: string) {
  return invoke<OpenedDocument>('open_text_file_by_path', {
    root,
    path,
  })
}

export async function createFile(root: string, parentPath: string, name: string) {
  return invoke<string>('create_file', {
    root,
    parentPath,
    name,
  })
}

export async function createDirectory(root: string, parentPath: string, name: string) {
  return invoke<string>('create_directory', {
    root,
    parentPath,
    name,
  })
}

export async function renamePath(root: string, path: string, newName: string) {
  return invoke<string>('rename_path', {
    root,
    path,
    newName,
  })
}

export async function trashPath(root: string, path: string) {
  return invoke<void>('trash_path', {
    root,
    path,
  })
}
