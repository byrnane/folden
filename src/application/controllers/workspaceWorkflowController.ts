import { t } from '../i18n'
import type { ComputedRef } from 'vue'
import type { OpenDocument } from '../../domain/documents/documentState'
import type { OpenedDocument, WorkspaceDescriptor, WorkspaceEntry } from '../../domain/native'
import type { WorkspaceFilePort } from '../ports/nativePorts'
import { formatError } from '../helpers/errorHelpers'
import { normalizePath, parentPath } from '../helpers/pathHelpers'
import type { EditorPane } from '../types/shell'

type WorkspaceEntryRef = Pick<WorkspaceEntry, 'name' | 'path' | 'kind'> & {
  readonly children?: unknown
}

type ReadonlyValue<T> = {
  readonly value: T
}

type WorkspaceWorkflowDeps = {
  workspaceFiles: WorkspaceFilePort
  workspace: ReadonlyValue<{ id: string; rootPath: string } | null>
  documents: ReadonlyValue<OpenDocument[]>
  expandedWorkspacePaths: ReadonlyValue<ReadonlySet<string>>
  activeDocument: ComputedRef<OpenDocument | null>
  activePane: ComputedRef<EditorPane | undefined>
  selectedDirectoryPath: ComputedRef<string | null>
  isDirty: (document: OpenDocument) => boolean
  runFileTask: (task: () => Promise<void>, message: string) => Promise<void>
  openUnsavedDialog: (options: {
    title: string
    message: string
    saveLabel: string
    discardLabel: string
    cancelLabel: string
    showSave: boolean
  }) => Promise<'save' | 'discard' | 'cancel'>
  openConfirmDialog: (options: {
    title: string
    message: string
    confirmLabel: string
    cancelLabel: string
    confirmTone: 'default' | 'danger'
  }) => Promise<boolean>
  openPromptDialog: (options: {
    title: string
    message: string
    initialValue: string
    placeholder: string
    confirmLabel: string
    inputLabel: string
    validate?: (value: string) => string | null
    normalize?: (value: string) => string
  }) => Promise<string | null>
  setWatcherWarning: (message: string | null) => void
  setWatcherVisibleWorkspace: (descriptor: WorkspaceDescriptor, entries: WorkspaceEntry[]) => void
  setWorkspaceSettings: (settings: { ignoredPaths: string[] }) => void
  addIgnoredWorkspacePath: (path: string) => { ignoredPaths: string[] }
  clearWorkspaceLoadError: (path: string) => void
  setWorkspaceLoadError: (path: string, message: string) => void
  setWorkspacePathLoading: (path: string, loading: boolean) => void
  setWorkspacePathExpanded: (path: string, expanded: boolean) => void
  removeWorkspacePathState: (path: string) => void
  remapWorkspacePathState: (previousPath: string, nextPath: string) => void
  setSelectedPath: (path: string | null) => void
  applyWorkspaceBranch: (path: string, entries: WorkspaceEntry[]) => void
  loadedDescendantPaths: (
    path: string,
    isSameOrChildPath: (path: string, parent: string) => boolean,
  ) => string[]
  shouldLoadBranch: (path: string) => boolean
  nearestLoadedWorkspaceBranch: (
    path: string | null,
    parentPath: (path: string) => string | null,
  ) => string
  scheduleWorkspaceRefreshDebounced: (key: string, refresh: () => void) => void
  getDocument: (documentId: string) => OpenDocument | null
  saveDirtyDocuments: (documentIds: string[]) => Promise<boolean>
  removeDocumentsFromPanes: (documentIds: string[]) => void
  normalizePaneState: () => void
  updateDocumentPaths: (previousPath: string, nextPath: string, workspaceRootPath?: string) => void
  openLoadedDocument: (document: OpenedDocument, paneId?: EditorPane['id']) => Promise<OpenDocument>
  openWorkspaceFile: (entry: WorkspaceEntryRef, paneId?: EditorPane['id']) => Promise<void>
  setSplitEnabled: (enabled: boolean) => void
  moveDocumentToPane: (
    document: OpenDocument,
    sourcePaneId: EditorPane['id'],
    targetPaneId: EditorPane['id'],
  ) => void
}

export function createWorkspaceWorkflowController(deps: WorkspaceWorkflowDeps) {
  async function openWorkspace() {
    await deps.runFileTask(async () => {
      const descriptor = await deps.workspaceFiles.openWorkspaceDirectory()

      if (!descriptor) {
        return
      }

      if (!(await prepareWorkspaceSwitch(descriptor.rootPath))) {
        return
      }

      await loadWorkspace(descriptor)
    }, t('Could not open workspace'))
  }

  async function loadWorkspace(descriptor: WorkspaceDescriptor) {
    let settings = { ignoredPaths: [] as string[] }

    try {
      settings = await deps.workspaceFiles.loadWorkspaceSettings(descriptor.id)
    } catch (error) {
      deps.setWatcherWarning(formatError(error))
    }

    deps.setWorkspaceSettings(settings)
    deps.setWatcherVisibleWorkspace(
      descriptor,
      await deps.workspaceFiles.listDirectory(descriptor.id, ''),
    )
  }

  function getWorkspaceDocumentIds(workspaceId: string) {
    return deps.documents.value
      .filter((document) => document.workspaceId === workspaceId)
      .map((document) => document.id)
  }

  async function prepareWorkspaceSwitch(nextRootPath: string) {
    const currentWorkspace = deps.workspace.value

    if (
      !currentWorkspace ||
      normalizePath(currentWorkspace.rootPath) === normalizePath(nextRootPath)
    ) {
      return true
    }

    const affectedDocumentIds = getWorkspaceDocumentIds(currentWorkspace.id)
    const dirtyWorkspaceDocuments = affectedDocumentIds
      .map((documentId) => deps.getDocument(documentId))
      .filter((document): document is OpenDocument => document !== null && deps.isDirty(document))

    if (dirtyWorkspaceDocuments.length) {
      const decision = await deps.openUnsavedDialog({
        title: t('Switch workspace?'),
        message: t(
          dirtyWorkspaceDocuments.length === 1
            ? 'Save changes to {count} unsaved document before switching workspace?'
            : 'Save changes to {count} unsaved documents before switching workspace?',
          { count: dirtyWorkspaceDocuments.length },
        ),
        saveLabel: t('Save and switch'),
        discardLabel: t('Switch without saving'),
        cancelLabel: t('Cancel'),
        showSave: true,
      })

      if (decision === 'cancel') {
        return false
      }

      if (decision === 'save') {
        const saved = await deps.saveDirtyDocuments(
          dirtyWorkspaceDocuments.map((document) => document.id),
        )

        if (!saved) {
          return false
        }
      }
    }

    deps.removeDocumentsFromPanes(affectedDocumentIds)
    deps.normalizePaneState()
    return true
  }

  async function refreshWorkspace() {
    await refreshWorkspaceBranch('')
  }

  async function refreshWorkspaceBranch(branchPath: string | null, preserveDescendants = true) {
    if (!deps.workspace.value) {
      return
    }

    const normalizedBranchPath = branchPath ?? ''
    deps.clearWorkspaceLoadError(normalizedBranchPath)
    deps.applyWorkspaceBranch(
      normalizedBranchPath,
      await deps.workspaceFiles.listDirectory(deps.workspace.value.id, normalizedBranchPath),
    )

    if (!preserveDescendants) {
      return
    }

    const descendantPaths = deps.loadedDescendantPaths(normalizedBranchPath, isSameOrChildPath)

    for (const descendantPath of descendantPaths) {
      await refreshWorkspaceBranch(descendantPath, false)
    }
  }

  async function ensureWorkspaceBranchLoaded(branchPath: string) {
    if (!deps.shouldLoadBranch(branchPath)) {
      return
    }

    deps.setWorkspacePathLoading(branchPath, true)

    try {
      await refreshWorkspaceBranch(branchPath)
    } catch (error) {
      deps.setWorkspaceLoadError(branchPath, formatError(error))
      throw error
    } finally {
      deps.setWorkspacePathLoading(branchPath, false)
    }
  }

  async function toggleWorkspaceDirectory(entry: WorkspaceEntryRef) {
    if (deps.expandedWorkspacePaths.value.has(entry.path)) {
      deps.setWorkspacePathExpanded(entry.path, false)
      return
    }

    deps.setWorkspacePathExpanded(entry.path, true)

    try {
      await ensureWorkspaceBranchLoaded(entry.path)
    } catch (error) {
      deps.setWatcherWarning(
        t('Could not load folder {name}: {error}', { name: entry.name, error: formatError(error) }),
      )
    }
  }

  function scheduleWorkspaceRefresh(branchPath: string | null) {
    const key = deps.nearestLoadedWorkspaceBranch(branchPath, parentPath)
    deps.scheduleWorkspaceRefreshDebounced(key, () => {
      void refreshWorkspaceBranch(key).catch((error) => {
        deps.setWatcherWarning(
          t('Could not refresh workspace after external changes: {error}', {
            error: formatError(error),
          }),
        )
      })
    })
  }

  async function openEntryInRight(entry: WorkspaceEntryRef) {
    deps.setSplitEnabled(true)
    await deps.openWorkspaceFile(entry, 'right')
  }

  function moveActiveDocumentToRight() {
    const document = deps.activeDocument.value
    const sourcePane = deps.activePane.value

    if (!document || !sourcePane) {
      return
    }

    const targetPaneId = sourcePane.id === 'right' ? 'left' : 'right'
    deps.moveDocumentToPane(document, sourcePane.id, targetPaneId)
  }

  async function createWorkspaceFile(parentPath = deps.selectedDirectoryPath.value) {
    if (!deps.workspace.value || parentPath === null) {
      return
    }

    const name = await deps.openPromptDialog({
      title: t('Create file'),
      message: t('Enter a name for the new file.'),
      initialValue: 'Untitled.md',
      placeholder: 'Untitled.md',
      confirmLabel: t('Create'),
      inputLabel: t('File name'),
      validate: validateEntryName,
      normalize: normalizePromptValue,
    })

    if (!name) {
      return
    }

    await deps.runFileTask(async () => {
      const path = await deps.workspaceFiles.createFile(deps.workspace.value!.id, parentPath, name)
      await refreshWorkspaceBranch(parentPath)
      const document = await deps.workspaceFiles.openTextFileByPath(deps.workspace.value!.id, path)
      await deps.openLoadedDocument(document)
    }, t('Could not create file'))
  }

  async function createWorkspaceDirectory(parentPath = deps.selectedDirectoryPath.value) {
    if (!deps.workspace.value || parentPath === null) {
      return
    }

    const name = await deps.openPromptDialog({
      title: t('Create folder'),
      message: t('Enter a name for the new folder.'),
      initialValue: 'New Folder',
      placeholder: 'New Folder',
      confirmLabel: t('Create'),
      inputLabel: t('Folder name'),
      validate: validateEntryName,
      normalize: normalizePromptValue,
    })

    if (!name) {
      return
    }

    await deps.runFileTask(async () => {
      await deps.workspaceFiles.createDirectory(deps.workspace.value!.id, parentPath, name)
      await refreshWorkspaceBranch(parentPath)
    }, t('Could not create folder'))
  }

  async function renameWorkspacePath(entry: WorkspaceEntryRef) {
    if (!deps.workspace.value) {
      return
    }

    const newName = await deps.openPromptDialog({
      title: t('Rename'),
      message: t('Enter a new name for {name}.', { name: entry.name }),
      initialValue: entry.name,
      placeholder: entry.name,
      confirmLabel: t('Rename'),
      inputLabel: t('Name'),
      validate: validateEntryName,
      normalize: normalizePromptValue,
    })

    if (!newName || newName === entry.name) {
      return
    }

    await deps.runFileTask(async () => {
      const nextPath = await deps.workspaceFiles.renamePath(
        deps.workspace.value!.id,
        entry.path,
        newName,
      )
      deps.remapWorkspacePathState(entry.path, nextPath)
      deps.updateDocumentPaths(entry.path, nextPath, deps.workspace.value!.rootPath)
      deps.setSelectedPath(nextPath)
      await refreshWorkspaceBranch(parentPath(nextPath) ?? '')
    }, t('Could not rename path'))
  }

  async function trashWorkspacePath(entry: WorkspaceEntryRef) {
    if (!deps.workspace.value) {
      return
    }

    const workspaceId = deps.workspace.value.id
    const affectedDocuments = deps.documents.value.filter((document) =>
      document.workspaceId === workspaceId && document.relativePath
        ? isSameOrChildPath(document.relativePath, entry.path)
        : false,
    )
    const hasDirtyDocument = affectedDocuments.some(deps.isDirty)
    if (hasDirtyDocument) {
      const decision = await deps.openUnsavedDialog({
        title: t('Move {name} to trash?', { name: entry.name }),
        message: t('Save changes before moving {name} to trash?', { name: entry.name }),
        saveLabel: t('Save and move'),
        discardLabel: t('Move without saving'),
        cancelLabel: t('Cancel'),
        showSave: true,
      })

      if (decision === 'cancel') {
        return
      }

      if (decision === 'save') {
        const saved = await deps.saveDirtyDocuments(
          affectedDocuments.map((document) => document.id),
        )

        if (!saved) {
          return
        }
      }
    } else {
      const confirmed = await deps.openConfirmDialog({
        title: t('Move {name} to trash?', { name: entry.name }),
        message: t('Move {name} to trash?', { name: entry.name }),
        confirmLabel: t('Move to trash'),
        cancelLabel: t('Cancel'),
        confirmTone: 'danger',
      })

      if (!confirmed) {
        return
      }
    }

    await deps.runFileTask(async () => {
      await deps.workspaceFiles.trashPath(deps.workspace.value!.id, entry.path)
      deps.removeWorkspacePathState(entry.path)
      deps.removeDocumentsFromPanes(affectedDocuments.map((document) => document.id))
      deps.setSelectedPath(null)
      await refreshWorkspaceBranch(parentPath(entry.path) ?? '')
    }, t('Could not move path to trash'))
  }

  async function hideWorkspacePath(entry: WorkspaceEntryRef) {
    if (!deps.workspace.value) {
      return
    }

    await deps.runFileTask(async () => {
      const settings = deps.addIgnoredWorkspacePath(entry.path)
      await deps.workspaceFiles.saveWorkspaceSettings(deps.workspace.value!.id, settings)
      deps.removeWorkspacePathState(entry.path)
      deps.setSelectedPath(null)
      await refreshWorkspaceBranch(parentPath(entry.path) ?? '')
    }, t('Could not hide path from workspace'))
  }

  function isSameOrChildPath(path: string, parent: string) {
    const normalizedPath = normalizePath(path)
    const normalizedParent = normalizePath(parent)

    return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`)
  }

  function validateEntryName(value: string) {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return t('Name is required.')
    }

    if (trimmedValue === '.' || trimmedValue === '..') {
      return t('Name is not allowed.')
    }

    if (/[\\/]/.test(trimmedValue)) {
      return t('Name cannot contain path separators.')
    }

    return null
  }

  function normalizePromptValue(value: string) {
    return value.trim()
  }

  return {
    createWorkspaceDirectory,
    createWorkspaceFile,
    loadWorkspace,
    moveActiveDocumentToRight,
    openEntryInRight,
    openWorkspace,
    refreshWorkspace,
    refreshWorkspaceBranch,
    renameWorkspacePath,
    scheduleWorkspaceRefresh,
    hideWorkspacePath,
    toggleWorkspaceDirectory,
    trashWorkspacePath,
  }
}
