import {
  buildDocumentMapLines,
  extractMarkdownHeadings,
  type DocumentMapSegment,
  type MarkdownHeading,
} from './outline'

export type DocumentAnalysisRequest = {
  documentId: string
  revision: number
  content: string
  isMarkdown: boolean
}

export type DocumentAnalysisResult = {
  documentId: string
  revision: number
  headings: MarkdownHeading[]
  mapSegments: DocumentMapSegment[]
  wordCount: number
}

export function countDocumentWords(content: string) {
  let count = 0
  let inWord = false
  for (const character of content) {
    if (/\s/u.test(character)) {
      inWord = false
    } else if (!inWord) {
      count += 1
      inWord = true
    }
  }
  return count
}

export function analyzeDocument(request: DocumentAnalysisRequest): DocumentAnalysisResult {
  return {
    documentId: request.documentId,
    revision: request.revision,
    headings: request.isMarkdown ? extractMarkdownHeadings(request.content) : [],
    mapSegments: request.isMarkdown ? buildDocumentMapLines(request.content) : [],
    wordCount: countDocumentWords(request.content),
  }
}
