import { describe, expect, it } from 'vitest'
import {
  editorInlinePaddingForWidth,
  resolveAdaptiveEditorLayout,
  type AdaptiveEditorLayoutInput,
} from '../../../src/ui/views/adaptiveEditorLayout'

function input(overrides: Partial<AdaptiveEditorLayoutInput> = {}): AdaptiveEditorLayoutInput {
  return {
    availableWidth: 1400,
    enabled: true,
    showActivity: true,
    activityWidth: 44,
    showSidebar: true,
    preserveSidebar: false,
    sidebarWidth: 260,
    showDocumentOutline: true,
    outlineWidth: 220,
    showDocumentMap: true,
    documentMapWidth: 64,
    protectedEditorWidth: 720,
    panes: [{ fraction: 1, hasOutline: true, hasDocumentMap: true }],
    splitStacked: false,
    ...overrides,
  }
}

describe('adaptive editor layout', () => {
  it('hides sidebar, map and outline in priority order', () => {
    expect(resolveAdaptiveEditorLayout(input({ availableWidth: 1400 }))).toEqual({
      showSidebar: true,
      showDocumentOutline: true,
      showDocumentMap: true,
    })
    expect(resolveAdaptiveEditorLayout(input({ availableWidth: 1100 }))).toEqual({
      showSidebar: false,
      showDocumentOutline: true,
      showDocumentMap: true,
    })
    expect(resolveAdaptiveEditorLayout(input({ availableWidth: 1000 }))).toEqual({
      showSidebar: false,
      showDocumentOutline: true,
      showDocumentMap: false,
    })
    expect(resolveAdaptiveEditorLayout(input({ availableWidth: 950 }))).toEqual({
      showSidebar: false,
      showDocumentOutline: false,
      showDocumentMap: false,
    })
  })

  it('preserves manual preferences and bypasses adaptation outside editor workbench', () => {
    expect(
      resolveAdaptiveEditorLayout(
        input({
          availableWidth: 700,
          showSidebar: false,
          showDocumentMap: false,
          enabled: false,
        }),
      ),
    ).toEqual({
      showSidebar: false,
      showDocumentOutline: true,
      showDocumentMap: false,
    })
  })

  it('keeps an explicitly reopened sidebar and then sacrifices navigation', () => {
    expect(
      resolveAdaptiveEditorLayout(input({ availableWidth: 1000, preserveSidebar: true })),
    ).toEqual({
      showSidebar: true,
      showDocumentOutline: false,
      showDocumentMap: false,
    })
  })

  it('uses pane fractions for horizontal split and one width for stacked split', () => {
    const panes = [
      { fraction: 0.25, hasOutline: true, hasDocumentMap: true },
      { fraction: 0.75, hasOutline: false, hasDocumentMap: true },
    ]

    expect(
      resolveAdaptiveEditorLayout(input({ availableWidth: 1800, panes, showSidebar: false })),
    ).toEqual({
      showSidebar: false,
      showDocumentOutline: false,
      showDocumentMap: false,
    })
    expect(
      resolveAdaptiveEditorLayout(
        input({ availableWidth: 1800, panes, showSidebar: false, splitStacked: true }),
      ),
    ).toEqual({
      showSidebar: false,
      showDocumentOutline: true,
      showDocumentMap: true,
    })
  })

  it('restores requested panels when width returns and matches editor padding breakpoints', () => {
    const narrow = resolveAdaptiveEditorLayout(input({ availableWidth: 950 }))
    const restored = resolveAdaptiveEditorLayout(input({ availableWidth: 1400 }))

    expect(narrow.showDocumentOutline).toBe(false)
    expect(restored).toEqual({
      showSidebar: true,
      showDocumentOutline: true,
      showDocumentMap: true,
    })
    expect(editorInlinePaddingForWidth(681)).toBe(72)
    expect(editorInlinePaddingForWidth(680)).toBe(64)
  })
})
