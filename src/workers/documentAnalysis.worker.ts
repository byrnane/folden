import { analyzeDocument, type DocumentAnalysisRequest } from '../domain/markdown/documentAnalysis'

const workerScope = self as unknown as {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<DocumentAnalysisRequest>) => void,
  ) => void
  postMessage: (result: ReturnType<typeof analyzeDocument>) => void
}

workerScope.addEventListener('message', (event) => {
  workerScope.postMessage(analyzeDocument(event.data))
})
