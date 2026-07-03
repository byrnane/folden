import { describe, expect, it } from 'vitest'
import { parseDocumentDragPayload } from '../../../src/ui/documentDrag'

describe('document drag payload', () => {
  it('accepts a valid document drag payload', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'tab',
      documentId: 'document-1',
      paneId: 'left',
    }))).toEqual({
      kind: 'tab',
      documentId: 'document-1',
      paneId: 'left',
    })
  })

  it('rejects malformed payload JSON', () => {
    expect(parseDocumentDragPayload('{')).toBeNull()
  })

  it('rejects missing payload fields', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'tab',
      paneId: 'left',
    }))).toBeNull()
  })

  it('rejects unknown drag kinds', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'workspace-entry',
      documentId: 'document-1',
      paneId: 'left',
    }))).toBeNull()
  })

  it('rejects unknown pane ids', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'tab',
      documentId: 'document-1',
      paneId: 'center',
    }))).toBeNull()
  })

  it('rejects non-string document ids', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'tab',
      documentId: 42,
      paneId: 'left',
    }))).toBeNull()
  })
})
