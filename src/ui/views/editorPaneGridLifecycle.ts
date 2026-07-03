import type { EditorPane } from '../../application/types/shell'

export type TabPointerDrag = {
  documentId: string
  sourcePaneId: EditorPane['id']
  pointerId: number
  sourceElement: Pick<HTMLElement, 'hasPointerCapture' | 'releasePointerCapture'>
  startX: number
  startY: number
  dragging: boolean
}

type BooleanState = {
  value: boolean
}

export type EditorPaneGridInteractionState = {
  tabPointerDrag: {
    value: TabPointerDrag | null
  }
  suppressNextTabClick: BooleanState
  suppressNextTabClickTimeout: number
}

export function releaseTabPointerCapture(drag: TabPointerDrag) {
  try {
    if (drag.sourceElement.hasPointerCapture(drag.pointerId)) {
      drag.sourceElement.releasePointerCapture(drag.pointerId)
    }
  } catch {
    // Pointer capture can already be gone when the tab or pane unmounts.
  }
}

export function clearPendingTabClickSuppression(
  state: EditorPaneGridInteractionState,
  clearTimeoutFn: typeof window.clearTimeout = window.clearTimeout,
) {
  if (state.suppressNextTabClickTimeout !== 0) {
    clearTimeoutFn(state.suppressNextTabClickTimeout)
    state.suppressNextTabClickTimeout = 0
  }

  state.suppressNextTabClick.value = false
}

export function cleanupEditorPaneGridInteractionState(
  state: EditorPaneGridInteractionState,
  clearTimeoutFn: typeof window.clearTimeout = window.clearTimeout,
) {
  clearPendingTabClickSuppression(state, clearTimeoutFn)

  const drag = state.tabPointerDrag.value
  state.tabPointerDrag.value = null

  if (drag) {
    releaseTabPointerCapture(drag)
  }
}
