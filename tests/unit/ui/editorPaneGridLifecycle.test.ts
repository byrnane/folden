import { describe, expect, it, vi } from 'vitest'
import {
  cleanupEditorPaneGridInteractionState,
  releaseTabPointerCapture,
  type EditorPaneGridInteractionState,
  type TabPointerDrag,
} from '../../../src/ui/views/editorPaneGridLifecycle'

function createDrag(sourceElement: TabPointerDrag['sourceElement']): TabPointerDrag {
  return {
    documentId: 'document-a',
    label: 'document-a.md',
    sourcePaneId: 'left',
    pointerId: 12,
    sourceElement,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    dragging: true,
  }
}

describe('editor pane grid lifecycle cleanup', () => {
  it('safely releases active pointer capture during cleanup', () => {
    const releasePointerCapture = vi.fn()
    const drag = createDrag({
      hasPointerCapture: () => true,
      releasePointerCapture,
    })
    const state: EditorPaneGridInteractionState = {
      tabPointerDrag: { value: drag },
      suppressNextTabClick: { value: false },
      suppressNextTabClickTimeout: 0,
    }

    cleanupEditorPaneGridInteractionState(state, vi.fn())

    expect(releasePointerCapture).toHaveBeenCalledWith(12)
    expect(state.tabPointerDrag.value).toBeNull()
  })

  it('ignores lost pointer capture while releasing drag state', () => {
    const drag = createDrag({
      hasPointerCapture: () => {
        throw new Error('pointer is already gone')
      },
      releasePointerCapture: vi.fn(),
    })

    expect(() => releaseTabPointerCapture(drag)).not.toThrow()
  })

  it('clears pending suppress-next-click timeout before it can run after cleanup', () => {
    vi.useFakeTimers()
    const timeoutCallback = vi.fn()
    const timeoutId = setTimeout(timeoutCallback, 1) as unknown as number
    const state: EditorPaneGridInteractionState = {
      tabPointerDrag: { value: null },
      suppressNextTabClick: { value: true },
      suppressNextTabClickTimeout: timeoutId,
    }

    cleanupEditorPaneGridInteractionState(state, clearTimeout as unknown as typeof window.clearTimeout)
    vi.runAllTimers()

    expect(timeoutCallback).not.toHaveBeenCalled()
    expect(state.suppressNextTabClick.value).toBe(false)
    expect(state.suppressNextTabClickTimeout).toBe(0)
    vi.useRealTimers()
  })
})
