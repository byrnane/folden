import { createDocumentState, type OpenDocument } from '../../domain/documents/documentState'
import { isDocumentDirty } from '../../domain/document'
import {
  fileNameFromPath,
  isMarkdownPath,
  normalizePath,
} from '../helpers/pathHelpers'

export function createDocumentController(initialText: string) {
  const documentState = createDocumentState({
    fileNameFromPath,
    isMarkdownPath,
    normalizePath,
  })
  const initialDocument = documentState.createScratchDocument(initialText, 'Untitled.md')

  function isDirty(document: OpenDocument) {
    return isDocumentDirty(document)
  }

  return {
    initialDocument,
    isDirty,
    ...documentState,
  }
}
