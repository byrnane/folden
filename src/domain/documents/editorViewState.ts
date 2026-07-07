export type SourceSelectionState = {
  kind?: 'source'
  anchor: number
  head: number
}

export type VisualSelectionState = {
  kind?: 'visual'
  from: number
  to: number
}

export function clampEditorPosition(position: number, min: number, max: number) {
  return Math.min(Math.max(position, min), max)
}

export function toSourceSelectionState(value: unknown, maxPosition: number): SourceSelectionState | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.anchor === 'number' && typeof value.head === 'number') {
    return {
      kind: 'source',
      anchor: clampEditorPosition(value.anchor, 0, maxPosition),
      head: clampEditorPosition(value.head, 0, maxPosition),
    }
  }

  if (typeof value.from === 'number' && typeof value.to === 'number') {
    return {
      kind: 'source',
      anchor: clampEditorPosition(value.from - 1, 0, maxPosition),
      head: clampEditorPosition(value.to - 1, 0, maxPosition),
    }
  }

  return null
}

export function toVisualSelectionState(value: unknown, maxPosition: number): VisualSelectionState | null {
  if (!isRecord(value) || maxPosition < 1) {
    return null
  }

  if (typeof value.from === 'number' && typeof value.to === 'number') {
    return {
      kind: 'visual',
      from: clampEditorPosition(value.from, 1, maxPosition),
      to: clampEditorPosition(value.to, 1, maxPosition),
    }
  }

  if (typeof value.anchor === 'number' && typeof value.head === 'number') {
    return {
      kind: 'visual',
      from: clampEditorPosition(value.anchor + 1, 1, maxPosition),
      to: clampEditorPosition(value.head + 1, 1, maxPosition),
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
