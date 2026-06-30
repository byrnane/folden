import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createWorkspaceController } from '../../../../src/application/controllers/workspaceController'
import type { ApplicationSettings } from '../../../../src/infrastructure/settings/settings'
import type { WorkspaceEntry } from '../../../../src/infrastructure/tauri/files'

const appSettings = ref<ApplicationSettings>({
  autosave: {
    enabled: false,
    debounceMs: 500,
  },
  remoteImages: {
    policy: 'blocked',
  },
  workspace: {
    ignoredNames: ['node_modules'],
  },
})

function file(path: string): WorkspaceEntry {
  return {
    name: path.split('\\').at(-1) ?? path,
    path,
    kind: 'file',
    children: [],
  }
}

function directory(path: string, children: WorkspaceEntry[] = []): WorkspaceEntry {
  return {
    name: path.split('\\').at(-1) ?? path,
    path,
    kind: 'directory',
    children,
  }
}

describe('workspace controller', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
  })

  it('loads workspace root, filters ignored names, and tracks recent paths', () => {
    const controller = createWorkspaceController(appSettings)

    controller.setWatcherVisibleWorkspace(
      { id: 'workspace-1', rootPath: 'C:\\Docs', name: 'Docs' },
      [file('README.md'), directory('node_modules')],
    )

    expect(controller.workspace.value?.entries.map((entry) => entry.path)).toEqual(['README.md'])
    expect(controller.loadedWorkspacePaths.value.has('')).toBe(true)
    expect(controller.recentWorkspaces.value).toEqual(['C:\\Docs'])
  })

  it('applies lazy branch loading state and replaces a loaded branch', () => {
    const controller = createWorkspaceController(appSettings)
    controller.setWatcherVisibleWorkspace(
      { id: 'workspace-1', rootPath: 'C:\\Docs', name: 'Docs' },
      [directory('src')],
    )

    expect(controller.shouldLoadBranch('src')).toBe(true)

    controller.setWorkspacePathLoading('src', true)
    expect(controller.shouldLoadBranch('src')).toBe(false)

    controller.setWorkspacePathLoading('src', false)
    controller.applyWorkspaceBranch('src', [file('src\\main.md')])

    expect(controller.loadedWorkspacePaths.value.has('src')).toBe(true)
    expect(controller.workspace.value?.entries[0]?.children).toEqual([file('src\\main.md')])
  })

  it('remaps selected path state and loaded descendants after rename', () => {
    const controller = createWorkspaceController(appSettings)
    controller.setWatcherVisibleWorkspace(
      { id: 'workspace-1', rootPath: 'C:\\Docs', name: 'Docs' },
      [directory('drafts', [file('drafts\\a.md')])],
    )
    controller.setWorkspacePathLoaded('drafts', true)
    controller.setWorkspacePathLoaded('drafts\\nested', true)
    controller.setWorkspacePathExpanded('drafts', true)
    controller.setWorkspaceLoadError('drafts\\nested', 'broken')

    controller.remapWorkspacePathState('drafts', 'archive')

    expect(controller.loadedWorkspacePaths.value.has('archive')).toBe(true)
    expect(controller.loadedWorkspacePaths.value.has('archive\\nested')).toBe(true)
    expect(controller.expandedWorkspacePaths.value.has('archive')).toBe(true)
    expect(controller.workspaceLoadErrors.value['archive\\nested']).toBe('broken')
  })

  it('removes branch path state when a tree is trashed', () => {
    const controller = createWorkspaceController(appSettings)
    controller.setWatcherVisibleWorkspace(
      { id: 'workspace-1', rootPath: 'C:\\Docs', name: 'Docs' },
      [directory('drafts')],
    )
    controller.setWorkspacePathLoaded('drafts', true)
    controller.setWorkspacePathLoaded('drafts\\nested', true)
    controller.setWorkspacePathExpanded('drafts', true)
    controller.setWorkspaceLoadError('drafts\\nested', 'broken')

    controller.removeWorkspacePathState('drafts')

    expect([...controller.loadedWorkspacePaths.value]).toEqual([''])
    expect([...controller.expandedWorkspacePaths.value]).toEqual([])
    expect(controller.workspaceLoadErrors.value).toEqual({})
  })
})
