import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  documentDragMimeType,
  parseDocumentDragPayload,
  readDocumentDragPayload,
  startDocumentDrag,
} from '../../../src/ui/documentDrag'

class DataTransferStub {
  dropEffect = 'none'
  effectAllowed = 'none'
  readonly values = new Map<string, string>()
  readonly setDragImage = vi.fn()

  setData(type: string, value: string) {
    this.values.set(type, value)
  }

  getData(type: string) {
    return this.values.get(type) ?? ''
  }
}

const originalDocument = globalThis.document
const originalWindow = globalThis.window

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
})

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

  it('accepts a valid workspace file drag payload', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'workspace-file',
      path: 'notes\\daily.md',
      label: 'daily.md',
    }))).toEqual({
      kind: 'workspace-file',
      path: 'notes\\daily.md',
      label: 'daily.md',
    })
  })

  it('accepts external path payloads', () => {
    expect(parseDocumentDragPayload(JSON.stringify({
      kind: 'external-path',
      path: 'C:\\Inbox\\draft.md',
      label: 'draft.md',
    }))).toEqual({
      kind: 'external-path',
      path: 'C:\\Inbox\\draft.md',
      label: 'draft.md',
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
      path: 'README.md',
      label: 'README.md',
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

  it('reads and starts a drag operation with stable MIME and text labels', () => {
    vi.useFakeTimers()
    const preview = {
      className: '',
      textContent: '',
      style: {
        position: '',
        top: '',
        left: '',
      },
      remove: vi.fn(),
    }
    const append = vi.fn()
    const dataTransfer = new DataTransferStub()
    const event = { dataTransfer } as unknown as DragEvent

    vi.stubGlobal('document', {
      createElement: vi.fn(() => preview),
      body: { append },
    })
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => globalThis.setTimeout(callback, 0),
    })

    startDocumentDrag(event, {
      kind: 'open-editor',
      documentId: 'document-1',
      paneId: 'right',
      label: 'daily.md',
    })

    expect(dataTransfer.getData(documentDragMimeType)).toBe(JSON.stringify({
      kind: 'open-editor',
      documentId: 'document-1',
      paneId: 'right',
      label: 'daily.md',
    }))
    expect(dataTransfer.getData('text/plain')).toBe('daily.md')
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dataTransfer.dropEffect).toBe('move')
    expect(append).toHaveBeenCalledWith(preview)
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(preview, 12, 12)
    expect(readDocumentDragPayload(event)).toEqual({
      kind: 'open-editor',
      documentId: 'document-1',
      paneId: 'right',
      label: 'daily.md',
    })

    vi.runOnlyPendingTimers()

    expect(preview.remove).toHaveBeenCalledOnce()
  })

  it('falls back to the document id when a tab drag has no label', () => {
    vi.useFakeTimers()
    const preview = {
      className: '',
      textContent: '',
      style: {
        position: '',
        top: '',
        left: '',
      },
      remove: vi.fn(),
    }
    const dataTransfer = new DataTransferStub()

    vi.stubGlobal('document', {
      createElement: vi.fn(() => preview),
      body: { append: vi.fn() },
    })
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => globalThis.setTimeout(callback, 0),
    })

    startDocumentDrag({ dataTransfer } as unknown as DragEvent, {
      kind: 'tab',
      documentId: 'document-1',
      paneId: 'left',
    })

    expect(dataTransfer.getData('text/plain')).toBe('document-1')
    expect(preview.textContent).toBe('document-1')
  })
})
