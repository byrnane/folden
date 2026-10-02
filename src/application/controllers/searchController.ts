import { computed, ref, watch, type Ref } from 'vue'
import type { WorkspaceFilePort, NativeEventPort } from '../ports/nativePorts'
import type { OpenDocument } from '../../domain/documents/documentState'
import type { Workspace } from '../types/shell'
import type { ApplicationSettings } from '../settings'
import { findTextMatches } from '../../domain/markdown/editorSearch'
import { normalizePath } from '../helpers/pathHelpers'
import { formatError } from '../helpers/errorHelpers'

export type WorkspaceHit = {
  path: string
  from: number
  to: number
  line: number
  column: number
  preview: string
}
type SearchDeps = {
  files: WorkspaceFilePort
  events: NativeEventPort
  workspace: { readonly value: Pick<Workspace, 'id' | 'rootPath'> | null }
  documents: Ref<OpenDocument[]>
  settings: Ref<ApplicationSettings>
  ignoredPaths: () => readonly string[]
  flush: () => void
  openResult: (hit: WorkspaceHit) => Promise<void>
  openFile: (path: string) => Promise<void>
}

export function createSearchController(deps: SearchDeps) {
  const query = ref(''),
    matchCase = ref(false),
    results = ref<WorkspaceHit[]>([])
  const busy = ref(false),
    partial = ref(false),
    skipped = ref(0),
    error = ref('')
  const quickOpen = ref(false),
    quickQuery = ref(''),
    quickFiles = ref<string[]>([]),
    quickBusy = ref(false)
  const quickError = ref(''),
    quickPartial = ref(false)
  let requestId = '',
    quickRequestId = '',
    requestWorkspaceId = '',
    quickWorkspaceId = '',
    timer: ReturnType<typeof setTimeout> | undefined
  let unlisten: (() => void) | undefined,
    disposed = false
  const quickResults = computed(() => {
    const value = quickQuery.value.toLocaleLowerCase()
    const rank = (path: string) =>
      path.split(/[\\/]/).at(-1)!.toLocaleLowerCase().startsWith(value)
        ? 0
        : path.toLocaleLowerCase().startsWith(value)
          ? 1
          : 2
    return quickFiles.value
      .filter((path) => path.toLocaleLowerCase().includes(value))
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .slice(0, 100)
  })
  function scanOptions(id: string) {
    return {
      workspaceId: deps.workspace.value!.id,
      requestId: id,
      ignoredNames: deps.settings.value.workspace.ignoredNames,
      ignoredPaths: [...deps.ignoredPaths()],
    }
  }
  function inMemoryResults() {
    const hits: WorkspaceHit[] = []
    let skipped = 0
    if (!query.value) return { hits, skipped }
    for (const document of deps.documents.value) {
      if (document.workspaceId !== deps.workspace.value?.id || !document.relativePath) continue
      const normalized = normalizePath(document.relativePath)
      if (
        document.relativePath
          .split(/[\\/]/)
          .some((name) =>
            deps.settings.value.workspace.ignoredNames.some(
              (ignore) => ignore.toLowerCase() === name.toLowerCase(),
            ),
          ) ||
        deps
          .ignoredPaths()
          .some(
            (path) =>
              normalized === normalizePath(path) ||
              normalized.startsWith(normalizePath(path) + '/'),
          )
      )
        continue
      if (
        document.content.length > 2 * 1024 * 1024 ||
        new TextEncoder().encode(document.content).length > 2 * 1024 * 1024
      ) {
        skipped++
        continue
      }
      let cursor = 0,
        lineStart = 0,
        line = 1
      for (const { from, to } of findTextMatches(
        document.content,
        query.value,
        matchCase.value,
        5001 - hits.length,
      )) {
        while (cursor < from) {
          if (document.content[cursor++] === '\n') {
            lineStart = cursor
            line++
          }
        }
        const newline = document.content.indexOf('\n', from)
        const previewStart = Math.max(lineStart, from - 80),
          previewEnd = Math.min(newline < 0 ? document.content.length : newline, from + 160)
        hits.push({
          path: document.relativePath,
          from,
          to,
          line,
          column: from - lineStart + 1,
          preview: document.content.slice(previewStart, previewEnd).replace(/\r$/, ''),
        })
      }
      if (hits.length > 5000) break
    }
    return { hits, skipped }
  }
  async function refresh() {
    clearTimeout(timer)
    const oldId = requestId,
      workspace = deps.workspace.value
    requestId = crypto.randomUUID()
    if (oldId && requestWorkspaceId)
      void deps.files.cancelWorkspaceSearch(requestWorkspaceId, oldId).catch((cause) => {
        error.value = formatError(cause)
      })
    requestWorkspaceId = workspace?.id ?? ''
    results.value = []
    error.value = ''
    partial.value = false
    skipped.value = 0
    if (!workspace || !query.value) {
      busy.value = false
      return
    }
    deps.flush()
    const id = requestId,
      memory = inMemoryResults(),
      overlays = memory.hits
    results.value = overlays.slice(0, 5000)
    skipped.value = memory.skipped
    partial.value = overlays.length > 5000 || memory.skipped > 0
    busy.value = true
    try {
      const result = await deps.files.startWorkspaceSearch({
        ...scanOptions(id),
        query: query.value,
        caseSensitive: matchCase.value,
        excludedPaths: deps.documents.value
          .filter((doc) => doc.workspaceId === workspace.id && doc.relativePath)
          .map((doc) => doc.relativePath!),
      })
      if (disposed || id !== requestId) return
      results.value = [...overlays, ...result.matches].slice(0, 5000)
      partial.value =
        result.partial || memory.skipped > 0 || overlays.length + result.matches.length > 5000
      skipped.value = result.skipped + memory.skipped
    } catch (cause) {
      if (id === requestId) error.value = formatError(cause)
    } finally {
      if (id === requestId) busy.value = false
    }
  }
  async function showQuickOpen() {
    if (!deps.workspace.value) return
    closeQuickOpen()
    const id = (quickRequestId = crypto.randomUUID())
    quickWorkspaceId = deps.workspace.value.id
    quickOpen.value = true
    quickQuery.value = ''
    quickFiles.value = []
    quickPartial.value = false
    quickBusy.value = true
    quickError.value = ''
    try {
      const result = await deps.files.listWorkspaceFiles(scanOptions(id))
      if (!disposed && id === quickRequestId) {
        quickFiles.value = result.files
        quickPartial.value = result.partial
      }
    } catch (cause) {
      if (id === quickRequestId) quickError.value = formatError(cause)
    } finally {
      if (id === quickRequestId) quickBusy.value = false
    }
  }
  function closeQuickOpen() {
    quickOpen.value = false
    if (quickWorkspaceId && quickRequestId)
      void deps.files.cancelWorkspaceSearch(quickWorkspaceId, quickRequestId).catch((cause) => {
        quickError.value = formatError(cause)
      })
    quickRequestId = ''
  }
  async function chooseQuickFile(path: string) {
    closeQuickOpen()
    await deps.openFile(path)
  }
  function scheduleRefresh() {
    const previous = requestId
    requestId = ''
    if (previous && requestWorkspaceId)
      void deps.files.cancelWorkspaceSearch(requestWorkspaceId, previous).catch((cause) => {
        error.value = formatError(cause)
      })
    results.value = []
    busy.value = false
    clearTimeout(timer)
    if (query.value) timer = setTimeout(() => void refresh(), 200)
  }
  const stopWorkspace = watch(
    () => deps.workspace.value?.id,
    () => {
      closeQuickOpen()
      quickFiles.value = []
    },
  )
  const stop = watch(
    [
      query,
      matchCase,
      () => deps.workspace.value?.id,
      () => deps.settings.value.workspace.ignoredNames,
      () => deps.ignoredPaths(),
      () => deps.documents.value.map((doc) => [doc.id, doc.revision]),
    ],
    scheduleRefresh,
    { deep: true },
  )
  void deps.events
    .listen<{ workspaceId: string; requestId: string; matches: WorkspaceHit[] }>(
      'folden://workspace-search-batch',
      (event) => {
        if (
          !disposed &&
          event.payload.requestId === requestId &&
          event.payload.workspaceId === deps.workspace.value?.id
        )
          results.value = [...results.value, ...event.payload.matches].slice(0, 5000)
      },
    )
    .then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })
    .catch((cause) => {
      error.value = formatError(cause)
    })
  function dispose() {
    disposed = true
    stop()
    stopWorkspace()
    clearTimeout(timer)
    unlisten?.()
    closeQuickOpen()
    if (requestWorkspaceId && requestId)
      void deps.files.cancelWorkspaceSearch(requestWorkspaceId, requestId).catch((cause) => {
        error.value = formatError(cause)
      })
  }
  return {
    query,
    matchCase,
    results,
    busy,
    partial,
    skipped,
    error,
    refresh,
    scheduleRefresh,
    openResult: deps.openResult,
    quickOpen,
    quickQuery,
    quickResults,
    quickBusy,
    quickError,
    quickPartial,
    showQuickOpen,
    closeQuickOpen,
    chooseQuickFile,
    dispose,
  }
}
