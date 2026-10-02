import { describe, expect, it, vi } from 'vitest'
import { createVisualSafetyController } from '../../../../src/application/controllers/visualSafetyController'
import { createTextFileFormat } from '../../../../src/domain/document'
import { createDocumentHistoryState } from '../../../../src/domain/documents/documentHistory'
import type { OpenDocument } from '../../../../src/domain/documents/documentState'

function documentFixture(overrides: Partial<OpenDocument> = {}): OpenDocument {
  return {
    id: 'document-1',
    nativeId: null,
    path: 'C:\\Notes\\draft.md',
    workspaceId: 'workspace-1',
    relativePath: 'draft.md',
    name: 'draft.md',
    content: '# Draft',
    revision: 1,
    persistedRevision: 1,
    defaultMode: 'visual',
    fileFormat: createTextFileFormat(),
    diskFingerprint: null,
    saveState: 'idle',
    saveError: null,
    externalState: 'idle',
    externalMessage: null,
    history: createDocumentHistoryState(),
    ...overrides,
  }
}

describe('visual safety controller', () => {
  it('updates remote image presence after edits without retaining revision reports', () => {
    const controller = createVisualSafetyController({
      setOpenDocumentMode: vi.fn(),
      openMarkdownSafetyDialog: vi.fn<() => Promise<boolean>>(),
    })
    const document = documentFixture()
    expect(controller.documentHasRemoteImages(document)).toBe(false)
    document.content = '![image](https://example.test/image.png)'
    document.revision++
    expect(controller.documentHasRemoteImages(document)).toBe(true)
    document.content = '![image](./image.png)'
    document.revision++
    expect(controller.documentHasRemoteImages(document)).toBe(false)
  })

  it('allows unsupported markdown through lossless raw blocks without a warning', async () => {
    const setOpenDocumentMode = vi.fn()
    const openMarkdownSafetyDialog = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(true)
    const controller = createVisualSafetyController({
      setOpenDocumentMode,
      openMarkdownSafetyDialog,
    })
    const document = documentFixture({
      content: '<div>raw html</div>',
      defaultMode: 'visual',
    })

    controller.enforceDocumentVisualSafety(document)

    expect(document.defaultMode).toBe('visual')
    expect(setOpenDocumentMode).not.toHaveBeenCalled()
    expect(controller.hasUnsafeUnacknowledgedVisualState(document)).toBe(false)

    await expect(controller.confirmVisualMode(document)).resolves.toBe(true)
    expect(openMarkdownSafetyDialog).not.toHaveBeenCalled()
    expect(controller.hasUnsafeUnacknowledgedVisualState(document)).toBe(false)
  })

  it('does not block non-markdown documents and clears stale remote image permissions', () => {
    const controller = createVisualSafetyController({
      setOpenDocumentMode: vi.fn(),
      openMarkdownSafetyDialog: vi.fn<() => Promise<boolean>>(),
    })
    const textDocument = documentFixture({
      path: 'C:\\Notes\\plain.txt',
      name: 'plain.txt',
      defaultMode: 'source',
      content: '<div>plain text</div>',
    })
    const markdownWithRemoteImage = documentFixture({
      id: 'document-2',
      content: '![Remote](https://example.test/image.png)',
    })

    controller.enforceDocumentVisualSafety(textDocument)
    controller.allowRemoteImagesForDocument(markdownWithRemoteImage)

    expect(controller.hasUnsafeUnacknowledgedVisualState(textDocument)).toBe(false)
    expect(controller.documentHasRemoteImages(markdownWithRemoteImage)).toBe(true)
    expect(controller.shouldLoadRemoteImages(markdownWithRemoteImage)).toBe(true)

    controller.clearRemoteImagePermissions(['document-2'])

    expect(controller.shouldLoadRemoteImages(markdownWithRemoteImage)).toBe(false)
  })

  it('keeps raw-block markdown editable after document revision changes', async () => {
    const controller = createVisualSafetyController({
      setOpenDocumentMode: vi.fn(),
      openMarkdownSafetyDialog: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    })
    const document = documentFixture({
      content: '<iframe src="https://example.test"></iframe>',
    })

    await expect(controller.confirmVisualMode(document)).resolves.toBe(true)
    expect(controller.hasUnsafeUnacknowledgedVisualState(document)).toBe(false)

    document.revision = 2
    controller.enforceDocumentVisualSafety(document)

    expect(controller.hasUnsafeUnacknowledgedVisualState(document)).toBe(false)
  })
})
