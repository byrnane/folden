import { t } from '../i18n'
import { shallowRef } from 'vue'
import type {
  DocumentAnalysisRequest,
  DocumentAnalysisResult,
} from '../../domain/markdown/documentAnalysis'

type AnalysisWorker = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener'>

type DocumentAnalysisControllerOptions = {
  createWorker: () => AnalysisWorker
  onError: (message: string | null) => void
  debounceMs?: number
}

export function createDocumentAnalysisController(options: DocumentAnalysisControllerOptions) {
  const analyses = shallowRef<Record<string, DocumentAnalysisResult>>({})
  const latestRevisions = new Map<string, number>()
  const pendingRequests = new Map<string, DocumentAnalysisRequest>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const worker = options.createWorker()
  const debounceMs = options.debounceMs ?? 120

  worker.addEventListener('message', (event: MessageEvent<DocumentAnalysisResult>) => {
    const result = event.data
    if (latestRevisions.get(result.documentId) !== result.revision) return
    analyses.value = { ...analyses.value, [result.documentId]: result }
    options.onError(null)
  })
  worker.addEventListener('error', () => {
    options.onError(t('Document analysis worker failed. Navigation data may be stale.'))
  })

  function dispatch(documentId: string) {
    const request = pendingRequests.get(documentId)
    if (!request) return
    pendingRequests.delete(documentId)
    timers.delete(documentId)
    worker.postMessage(request)
  }

  function request(request: DocumentAnalysisRequest) {
    const previousRevision = latestRevisions.get(request.documentId)
    if (previousRevision === request.revision) return
    latestRevisions.set(request.documentId, request.revision)
    pendingRequests.set(request.documentId, request)
    const currentTimer = timers.get(request.documentId)
    if (currentTimer !== undefined) globalThis.clearTimeout(currentTimer)
    const delay = previousRevision === undefined ? 0 : debounceMs
    timers.set(
      request.documentId,
      globalThis.setTimeout(() => dispatch(request.documentId), delay),
    )
  }

  function retain(documentIds: readonly string[]) {
    const retained = new Set(documentIds)
    analyses.value = Object.fromEntries(
      Object.entries(analyses.value).filter(([documentId]) => retained.has(documentId)),
    )
    for (const documentId of latestRevisions.keys()) {
      if (retained.has(documentId)) continue
      latestRevisions.delete(documentId)
      pendingRequests.delete(documentId)
      const timer = timers.get(documentId)
      if (timer !== undefined) globalThis.clearTimeout(timer)
      timers.delete(documentId)
    }
  }

  function dispose() {
    for (const timer of timers.values()) globalThis.clearTimeout(timer)
    timers.clear()
    worker.terminate()
  }

  return { analyses, request, retain, dispose }
}
