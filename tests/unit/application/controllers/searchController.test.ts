import { afterEach, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createSearchController } from '../../../../src/application/controllers/searchController'
import { createDocumentController } from '../../../../src/application/controllers/documentController'
import { defaultApplicationSettings } from '../../../../src/application/settings/defaults'
import type {
  NativeEventPort,
  WorkspaceFilePort,
} from '../../../../src/application/ports/nativePorts'
import type { WorkspaceSearchResult } from '../../../../src/domain/native'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function harness() {
  vi.useFakeTimers()
  const model = createDocumentController('')
  const draft = model.createScratchDocument('New unsaved text 😀')
  draft.workspaceId = 'ws'
  draft.relativePath = 'docs\\draft.md'
  const ignored = model.createScratchDocument('New hidden text')
  ignored.workspaceId = 'ws'
  ignored.relativePath = 'hidden\\draft.md'
  const listener = vi.fn()
  const files = {
    startWorkspaceSearch: vi
      .fn()
      .mockResolvedValue({ matches: [], partial: false, skipped: 0, cancelled: false }),
    listWorkspaceFiles: vi.fn().mockResolvedValue({
      files: ['nested\\notes.md', 'notes.md'],
      partial: false,
      skipped: 0,
      cancelled: false,
    }),
    cancelWorkspaceSearch: vi.fn().mockResolvedValue(undefined),
  }
  const settings = ref(structuredClone(defaultApplicationSettings))
  const controller = createSearchController({
    files: files as unknown as WorkspaceFilePort,
    events: { listen: listener.mockResolvedValue(vi.fn()) } as unknown as NativeEventPort,
    workspace: ref({ id: 'ws', rootPath: 'C:\\Docs' }),
    documents: model.documents,
    settings,
    ignoredPaths: () => ['hidden'],
    flush: vi.fn(),
    openResult: vi.fn(),
    openFile: vi.fn(),
  })
  cleanups.push(controller.dispose)
  return { controller, files, model, listener, draft }
}
const empty: WorkspaceSearchResult = { matches: [], partial: false, skipped: 0, cancelled: false }
it('searches current open content, skips ignores and excludes those documents from disk', async () => {
  const { controller, files } = harness()
  controller.query.value = 'New'
  await nextTick()
  await controller.refresh()
  expect(controller.results.value).toEqual([
    { path: 'docs\\draft.md', from: 0, to: 3, line: 1, column: 1, preview: 'New unsaved text 😀' },
  ])
  expect(files.startWorkspaceSearch).toHaveBeenCalledWith(
    expect.objectContaining({
      excludedPaths: ['docs\\draft.md', 'hidden\\draft.md'],
      ignoredPaths: ['hidden'],
    }),
  )
})
it('invalidates stale responses and streamed batches as soon as the query changes', async () => {
  const { controller, files, listener } = harness()
  const pending = deferred<WorkspaceSearchResult>()
  files.startWorkspaceSearch.mockReturnValueOnce(pending.promise)
  controller.query.value = 'first'
  await nextTick()
  const running = controller.refresh()
  const oldRequest = files.startWorkspaceSearch.mock.calls[0]![0]
  controller.query.value = 'second'
  await nextTick()
  expect(files.cancelWorkspaceSearch).toHaveBeenCalledWith('ws', oldRequest.requestId)
  listener.mock.calls[0]![1]({
    payload: {
      workspaceId: 'ws',
      requestId: oldRequest.requestId,
      matches: [{ path: 'old.md', from: 0, to: 5, line: 1, column: 1, preview: 'first' }],
    },
  })
  pending.resolve({
    ...empty,
    matches: [
      {
        path: 'old.md',
        from: 0,
        to: 5,
        line: 1,
        column: 1,
        preview: 'first',
        fingerprint: { size: 5, modifiedAtMs: 0 },
      },
    ],
  })
  await running
  expect(controller.results.value).toEqual([])
})
it('marks truncated in-memory results as partial and allows quick open from collapsed directories', async () => {
  const { controller, draft } = harness()
  draft.content = 'x '.repeat(5001)
  controller.query.value = 'x'
  await nextTick()
  await controller.refresh()
  expect(controller.results.value).toHaveLength(5000)
  expect(controller.partial.value).toBe(true)
  await controller.showQuickOpen()
  controller.quickQuery.value = 'nested'
  expect(controller.quickResults.value).toEqual(['nested\\notes.md'])
})
