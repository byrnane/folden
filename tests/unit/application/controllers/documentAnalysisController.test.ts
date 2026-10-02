import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { language } from '../../../../src/application/i18n'

beforeEach(() => {
  language.value = 'en'
})
import { createDocumentAnalysisController } from '../../../../src/application/controllers/documentAnalysisController'
import type { DocumentAnalysisResult } from '../../../../src/domain/markdown/documentAnalysis'

class FakeWorker {
  posted: unknown[] = []
  terminated = false
  listeners = new Map<string, ((event: MessageEvent<DocumentAnalysisResult>) => void)[]>()

  postMessage(value: unknown) {
    this.posted.push(value)
  }

  terminate() {
    this.terminated = true
  }

  addEventListener(type: string, listener: (event: MessageEvent<DocumentAnalysisResult>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  emit(type: 'message' | 'error', data?: DocumentAnalysisResult) {
    this.listeners
      .get(type)
      ?.forEach((listener) => listener({ data } as MessageEvent<DocumentAnalysisResult>))
  }
}

describe('document analysis controller', () => {
  afterEach(() => vi.useRealTimers())

  it('debounces revisions and ignores stale worker results', () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const onError = vi.fn()
    const controller = createDocumentAnalysisController({
      createWorker: () => worker as never,
      onError,
      debounceMs: 120,
    })
    controller.request({ documentId: 'doc', revision: 1, content: 'one', isMarkdown: true })
    vi.runAllTimers()
    controller.request({ documentId: 'doc', revision: 2, content: 'two', isMarkdown: true })
    worker.emit('message', {
      documentId: 'doc',
      revision: 1,
      headings: [],
      mapSegments: [],
      wordCount: 1,
    })
    expect(controller.analyses.value.doc).toBeUndefined()
    vi.advanceTimersByTime(120)
    expect(worker.posted).toHaveLength(2)

    worker.emit('message', {
      documentId: 'doc',
      revision: 2,
      headings: [],
      mapSegments: [],
      wordCount: 1,
    })
    expect(controller.analyses.value.doc?.revision).toBe(2)
    expect(onError).toHaveBeenLastCalledWith(null)
    controller.dispose()
    expect(worker.terminated).toBe(true)
  })

  it('retains the last result and reports worker failures', () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const onError = vi.fn()
    const controller = createDocumentAnalysisController({
      createWorker: () => worker as never,
      onError,
    })
    controller.request({ documentId: 'doc', revision: 1, content: 'one', isMarkdown: true })
    vi.runAllTimers()
    worker.emit('message', {
      documentId: 'doc',
      revision: 1,
      headings: [],
      mapSegments: [],
      wordCount: 1,
    })
    worker.emit('error')
    expect(controller.analyses.value.doc?.wordCount).toBe(1)
    expect(onError).toHaveBeenLastCalledWith(
      'Document analysis worker failed. Navigation data may be stale.',
    )
  })

  it('does not analyze the same document revision twice', () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const controller = createDocumentAnalysisController({
      createWorker: () => worker as never,
      onError: vi.fn(),
    })
    const request = { documentId: 'doc', revision: 1, content: 'one', isMarkdown: true }

    controller.request(request)
    controller.request(request)
    vi.runAllTimers()

    expect(worker.posted).toEqual([request])
  })
})
