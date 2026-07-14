export const adaptiveEditorLayoutBreakpoints = {
  stackedSplit: 900,
  narrowEditorPadding: 680,
} as const

export const adaptiveEditorLayoutSizes = {
  splitter: 6,
  regularEditorInlinePadding: 72,
  narrowEditorInlinePadding: 64,
} as const

export type AdaptiveEditorPane = {
  fraction: number
  hasOutline: boolean
  hasDocumentMap: boolean
}

export type AdaptiveEditorLayoutInput = {
  availableWidth: number
  enabled: boolean
  showActivity: boolean
  activityWidth: number
  showSidebar: boolean
  preserveSidebar: boolean
  sidebarWidth: number
  showDocumentOutline: boolean
  outlineWidth: number
  showDocumentMap: boolean
  documentMapWidth: number
  protectedEditorWidth: number
  panes: readonly AdaptiveEditorPane[]
  splitStacked: boolean
}

export type AdaptiveEditorLayout = {
  showSidebar: boolean
  showDocumentOutline: boolean
  showDocumentMap: boolean
}

export function editorInlinePaddingForWidth(width: number) {
  return width <= adaptiveEditorLayoutBreakpoints.narrowEditorPadding
    ? adaptiveEditorLayoutSizes.narrowEditorInlinePadding
    : adaptiveEditorLayoutSizes.regularEditorInlinePadding
}

function requiredWorkbenchWidth(input: AdaptiveEditorLayoutInput, layout: AdaptiveEditorLayout) {
  const paneWidths = input.panes.map((pane) => {
    const outlineWidth = layout.showDocumentOutline && pane.hasOutline ? input.outlineWidth : 0
    const mapWidth = layout.showDocumentMap && pane.hasDocumentMap ? input.documentMapWidth : 0
    return input.protectedEditorWidth + outlineWidth + mapWidth
  })

  if (!paneWidths.length) return 0
  if (paneWidths.length === 1 || input.splitStacked) return Math.max(...paneWidths)

  const paneAreaWidth = Math.max(
    ...paneWidths.map((width, index) => width / Math.max(input.panes[index].fraction, 0.01)),
  )
  return paneAreaWidth + adaptiveEditorLayoutSizes.splitter
}

function requiredShellWidth(input: AdaptiveEditorLayoutInput, layout: AdaptiveEditorLayout) {
  const activityWidth = input.showActivity
    ? input.activityWidth + adaptiveEditorLayoutSizes.splitter
    : 0
  const sidebarWidth = layout.showSidebar
    ? input.sidebarWidth + adaptiveEditorLayoutSizes.splitter
    : 0
  return activityWidth + sidebarWidth + requiredWorkbenchWidth(input, layout)
}

export function resolveAdaptiveEditorLayout(
  input: AdaptiveEditorLayoutInput,
): AdaptiveEditorLayout {
  const layout: AdaptiveEditorLayout = {
    showSidebar: input.showSidebar,
    showDocumentOutline: input.showDocumentOutline,
    showDocumentMap: input.showDocumentMap,
  }
  if (!input.enabled || !Number.isFinite(input.availableWidth)) return layout

  const fits = () => requiredShellWidth(input, layout) <= input.availableWidth
  if (fits()) return layout

  if (layout.showSidebar && !input.preserveSidebar) {
    layout.showSidebar = false
    if (fits()) return layout
  }
  if (layout.showDocumentMap) {
    layout.showDocumentMap = false
    if (fits()) return layout
  }
  if (layout.showDocumentOutline) layout.showDocumentOutline = false

  return layout
}
