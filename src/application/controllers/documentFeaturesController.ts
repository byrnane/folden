import { nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import { language, t } from '../i18n'
import { createSearchController, type WorkspaceHit } from './searchController'
import { templateContent, type DocumentTemplate } from '../../domain/documents/templates'
import { resolveDocumentLink } from '../../domain/documents/documentLinks'
import { findTextMatches } from '../../domain/markdown/editorSearch'
import type { EditorMode, OpenDocument } from '../../domain/documents/documentState'
import type { OpenedDocument, WorkspaceEntry } from '../../domain/native'
import type { NativePorts } from '../ports/nativePorts'
import type { ApplicationSettings } from '../settings'
import type { EditorAdapter, EditorPane, Workspace } from '../types/shell'
import type { ConfirmDialogState, PromptDialogState } from './dialogController'
import { isMarkdownDocument, normalizePath } from '../helpers/pathHelpers'

type DocumentFeaturesDeps = {
  nativePorts: Pick<NativePorts, 'documents' | 'workspace' | 'events'>
  workspace: Readonly<Ref<Pick<Workspace, 'id' | 'rootPath'> | null>>
  documents: Ref<OpenDocument[]>
  appSettings: Ref<ApplicationSettings>
  ignoredPaths: () => readonly string[]
  activePaneId: Ref<EditorPane['id']>
  activeDocument: ComputedRef<OpenDocument | null>
  activeEditorAdapter: ComputedRef<EditorAdapter | null>
  visiblePanes: ComputedRef<EditorPane[]>
  paneEditors: Ref<Partial<Record<EditorPane['id'], EditorAdapter | null>>>
  selectedDirectoryPath: ComputedRef<string | null>
  errorMessage: Ref<string | null>
  getPane: (paneId: EditorPane['id']) => EditorPane | null
  getDocument: (documentId: string) => OpenDocument | null
  openWorkspaceFile: (
    entry: Pick<WorkspaceEntry, 'path' | 'kind'>,
    paneId?: EditorPane['id'],
  ) => Promise<void>
  setPaneDocumentMode: (pane: EditorPane, document: OpenDocument, mode: EditorMode) => Promise<void>
  flushPaneEditorContent: (paneId: EditorPane['id']) => void
  shouldLoadRemoteImages: (document: OpenDocument) => boolean
  openPromptDialog: (options: Omit<PromptDialogState, 'resolve'>) => Promise<string | null>
  openConfirmDialog: (options: Omit<ConfirmDialogState, 'resolve'>) => Promise<boolean>
  createDocumentDraft: (content: string, fallbackName?: string) => OpenDocument
  openDocumentState: (document: OpenedDocument) => OpenDocument
  applyDocumentUpdate: (
    documentId: string,
    baseRevision: number,
    content: string,
    historyGroup?: string,
  ) => OpenDocument | null
  addDocumentToPane: (document: OpenDocument) => void
  saveDocument: (document: OpenDocument) => Promise<void>
  runFileTask: (task: () => Promise<void>, message: string) => Promise<void>
  refreshWorkspace: () => Promise<void>
  remapWorkspacePathState: (previousPath: string, nextPath: string) => void
  updateDocumentPaths: (previousPath: string, nextPath: string, workspaceRootPath?: string) => void
  setSelectedPath: (path: string | null) => void
}

export function createDocumentFeaturesController(deps: DocumentFeaturesDeps) {
  const {
    nativePorts,
    workspace,
    documents,
    appSettings,
    ignoredPaths,
    activePaneId,
    activeDocument,
    activeEditorAdapter,
    visiblePanes,
    paneEditors,
    selectedDirectoryPath,
    errorMessage,
    getPane,
    getDocument,
    openWorkspaceFile,
    setPaneDocumentMode,
    flushPaneEditorContent,
    shouldLoadRemoteImages,
    openPromptDialog,
    openConfirmDialog,
    createDocumentDraft: createDocumentDraftWithDefaultMode,
    openDocumentState: openDocumentStateWithDefaultMode,
    applyDocumentUpdate,
    addDocumentToPane,
    saveDocument,
    runFileTask,
    refreshWorkspace,
    remapWorkspacePathState,
    updateDocumentPaths,
    setSelectedPath,
  } = deps
  const findOpen = ref(false),
    findReplace = ref(false),
    findQuery = ref(''),
    findReplacement = ref(''),
    findCase = ref(false),
    findCount = ref(0),
    findIndex = ref(0)
  const printPending = ref(false)
  const printSnapshot = ref<{
    content: string
    path: string | null
    workspaceRootPath: string | null
    allowRemoteImages: boolean
    isMarkdown: boolean
  } | null>(null)
  const navigationHistory = ref<Array<{ path: string; anchor: string }>>([])
  const navigationIndex = ref(-1)

  function flushVisibleEditors() {
    for (const pane of visiblePanes.value) flushPaneEditorContent(pane.id)
  }
  async function waitForEditor(paneId: EditorPane['id']) {
    await nextTick()
    for (let attempt = 0; attempt < 200 && !paneEditors.value[paneId]; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 16))
    return paneEditors.value[paneId]
  }
  async function openSearchResult(hit: WorkspaceHit) {
    const pane = getPane(activePaneId.value)
    if (!pane) return
    await openWorkspaceFile({ path: hit.path, kind: 'file' }, pane.id)
    const document = getDocument(pane.activeDocumentId!)
    if (!document || normalizePath(document.relativePath ?? '') !== normalizePath(hit.path)) return
    await setPaneDocumentMode(pane, document, 'source')
    const matches = findTextMatches(
      document.content,
      projectSearch.query.value,
      projectSearch.matchCase.value,
    )
    const current =
      matches.find((match) => match.from === hit.from) ??
      matches.find((match) => match.from >= hit.from) ??
      matches[0]
    if (!current) {
      await projectSearch.refresh()
      return
    }
    ;(await waitForEditor(pane.id))?.revealSourceRange?.(current.from, current.to)
  }
  const projectSearch = createSearchController({
    files: nativePorts.workspace,
    events: nativePorts.events,
    workspace,
    documents,
    settings: appSettings,
    ignoredPaths,
    flush: flushVisibleEditors,
    openResult: openSearchResult,
    openFile: async (path) => {
      await openWorkspaceFile({ path, kind: 'file' })
    },
  })
  function refreshFind() {
    findCount.value =
      activeEditorAdapter.value?.search?.(findOpen.value ? findQuery.value : '', findCase.value) ??
      0
    findIndex.value = Math.max(0, Math.min(findIndex.value, findCount.value - 1))
    if (findOpen.value && findCount.value)
      activeEditorAdapter.value?.revealSearch?.(findIndex.value)
  }
  const stopFind = watch(
    [findOpen, findQuery, findCase, activeEditorAdapter, () => activeDocument.value?.revision],
    refreshFind,
    { flush: 'post' },
  )
  function nextFind(direction: number) {
    if (!findCount.value) return
    findIndex.value = (findIndex.value + direction + findCount.value) % findCount.value
    activeEditorAdapter.value?.revealSearch?.(findIndex.value)
  }
  function replaceFind(all: boolean) {
    activeEditorAdapter.value?.replaceSearch?.(findReplacement.value, all)
    refreshFind()
  }
  function preparePrint() {
    if (printPending.value) return
    flushVisibleEditors()
    const document = activeDocument.value
    if (document) {
      printPending.value = true
      printSnapshot.value = {
        content: document.content,
        path: document.path,
        workspaceRootPath: workspace.value?.rootPath ?? null,
        allowRemoteImages: shouldLoadRemoteImages(document),
        isMarkdown: isMarkdownDocument(document),
      }
    }
  }
  async function createFromTemplate(template: DocumentTemplate) {
    const title = await openPromptDialog({
      title: t('New document'),
      message: t('New document'),
      initialValue: '',
      placeholder: t('New document'),
      confirmLabel: t('Create'),
      inputLabel: t('New document'),
      validate: (value) => (value.trim() ? null : t('Enter a name.')),
      normalize: (value) => value.trim(),
    })
    if (!title) return
    const content = templateContent(template, title.replace(/[\r\n]/g, ' '), language.value)
    const name = `${title.replace(/[<>:"/\\|?*]/g, '').replace(/\.(md|markdown)$/i, '') || 'Untitled'}.md`
    if (!workspace.value) {
      addDocumentToPane(createDocumentDraftWithDefaultMode(content, name))
      return
    }
    await runFileTask(async () => {
      const path = await nativePorts.workspace.createFile(
        workspace.value!.id,
        selectedDirectoryPath.value ?? '',
        name,
      )
      const opened = await nativePorts.documents.openTextFileByPath(workspace.value!.id, path)
      const emptyDocument = openDocumentStateWithDefaultMode(opened)
      const document = content
        ? applyDocumentUpdate(emptyDocument.id, emptyDocument.revision, content, 'create-template')
        : emptyDocument
      if (!document) throw new Error(t('Could not create file'))
      addDocumentToPane(document)
      await waitForEditor(activePaneId.value)
      await saveDocument(document)
      await refreshWorkspace()
    }, t('Could not create file'))
  }
  async function importImage(paneId: EditorPane['id'], documentId: string, file: File | null) {
    await runFileTask(async () => {
      let document = getDocument(documentId)
      if (!document) return
      flushPaneEditorContent(paneId)
      if (!document.nativeId) {
        await saveDocument(document)
        document = getDocument(documentId)
        if (!document?.nativeId) return
      }
      const url = file
        ? await nativePorts.documents.importImageData(
            document.nativeId,
            Array.from(new Uint8Array(await file.arrayBuffer())),
            file.type,
            file.name,
          )
        : await nativePorts.documents.importImageFromPicker(document.nativeId)
      if (url && getPane(paneId)?.activeDocumentId === documentId)
        paneEditors.value[paneId]?.insertImportedImage?.(url)
      else if (url)
        errorMessage.value = t('Image imported. Return to the document to insert it.') + ' ' + url
    }, t('Could not import image'))
  }
  async function visitDocument(path: string, anchor: string, paneId = activePaneId.value) {
    await openWorkspaceFile({ path, kind: 'file' }, paneId)
    const pane = getPane(paneId),
      document = pane?.activeDocumentId ? getDocument(pane.activeDocumentId) : null
    if (!document || normalizePath(document.relativePath ?? '') !== normalizePath(path))
      return false
    if (anchor) (await waitForEditor(paneId))?.revealAnchor?.(anchor)
    return true
  }
  async function navigateLink(paneId: EditorPane['id'], documentId: string, href: string) {
    await runFileTask(async () => {
      const document = getDocument(documentId)
      if (!workspace.value || !document?.relativePath)
        throw new Error(t('Open a project folder to follow document links.'))
      const target = resolveDocumentLink(document.relativePath, href)
      const previous = { path: document.relativePath, anchor: '' }
      if (await visitDocument(target.path, target.anchor, paneId)) {
        navigationHistory.value = navigationHistory.value.slice(0, navigationIndex.value + 1)
        if (
          normalizePath(navigationHistory.value.at(-1)?.path ?? '') !== normalizePath(previous.path)
        )
          navigationHistory.value.push(previous)
        navigationHistory.value.push(target)
        navigationIndex.value = navigationHistory.value.length - 1
      }
    }, t('Could not open document link'))
  }
  async function navigateHistory(direction: number) {
    const next = navigationIndex.value + direction,
      entry = navigationHistory.value[next]
    if (entry && (await visitDocument(entry.path, entry.anchor))) navigationIndex.value = next
  }
  const stopHistory = watch(
    () => workspace.value?.id,
    () => {
      navigationHistory.value = []
      navigationIndex.value = -1
    },
  )
  async function moveWorkspacePath(
    entry: { path: string; name: string; kind: 'file' | 'directory' },
    targetParent?: string,
  ) {
    const target =
      targetParent ??
      (await openPromptDialog({
        title: t('Move'),
        message: t('Destination folder relative to the project; leave empty for root.'),
        initialValue: '',
        placeholder: '',
        inputLabel: t('Folder'),
        confirmLabel: t('Move'),
      }))
    if (target === null || !workspace.value) return
    if (
      !(await openConfirmDialog({
        title: t('Move'),
        message: t(
          'Relative links and images may need updating. Move without rewriting documents?',
        ),
        confirmLabel: t('Move'),
        cancelLabel: t('Cancel'),
        confirmTone: 'default',
      }))
    )
      return
    flushVisibleEditors()
    await runFileTask(async () => {
      const nextPath = await nativePorts.workspace.movePath(workspace.value!.id, entry.path, target)
      remapWorkspacePathState(entry.path, nextPath)
      updateDocumentPaths(entry.path, nextPath, workspace.value!.rootPath)
      setSelectedPath(nextPath)
      await refreshWorkspace()
    }, t('Could not move path'))
  }
  function dispose() {
    stopFind()
    stopHistory()
    projectSearch.dispose()
  }

  return {
    projectSearch,
    findOpen,
    findReplace,
    findQuery,
    findReplacement,
    findCase,
    findCount,
    findIndex,
    nextFind,
    replaceFind,
    printSnapshot,
    printPending,
    preparePrint,
    createFromTemplate,
    importImage,
    navigateLink,
    navigateHistory,
    navigationHistory,
    navigationIndex,
    moveWorkspacePath,
    dispose,
  }
}
