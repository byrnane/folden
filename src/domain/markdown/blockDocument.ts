export type MarkdownBlockKind =
  | 'paragraph'
  | 'heading'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'quote'
  | 'code-block'
  | 'divider'
  | 'image'
  | 'table'
  | 'raw'

export type RawMarkdownKind =
  'frontmatter' | 'html' | 'comment' | 'footnote' | 'directive' | 'unknown'

export type MarkdownBlock = {
  id: string
  kind: MarkdownBlockKind
  rawKind: RawMarkdownKind | null
  from: number
  to: number
  contentFrom: number
  rawSource: string
  visualJson: unknown | null
  state: 'untouched' | 'changed' | 'raw'
}

export type RawMarkdownBlock = MarkdownBlock & {
  kind: 'raw'
  rawKind: RawMarkdownKind
  state: 'raw'
}

export type MarkdownBlockDocument = {
  source: string
  blocks: MarkdownBlock[]
}

export type LogicalSelectionAnchor = {
  blockId: string
  relativeOffset: number
}

type SourceLine = {
  from: number
  to: number
  raw: string
  text: string
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  const expression = /[^\r\n]*(?:\r\n|\r|\n|$)/gu
  let match = expression.exec(source)

  while (match && match[0]) {
    const raw = match[0]
    const from = match.index
    lines.push({
      from,
      to: from + raw.length,
      raw,
      text: raw.replace(/(?:\r\n|\r|\n)$/u, ''),
    })
    match = expression.exec(source)
  }

  return lines
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isBlank(line: SourceLine | undefined) {
  return !line || line.text.trim() === ''
}

function isFenceStart(text: string) {
  return /^\s{0,3}(`{3,}|~{3,})/u.exec(text)?.[1] ?? null
}

function isTableDivider(text: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(text)
}

function startsNewBlock(lines: SourceLine[], index: number) {
  const text = lines[index]?.text ?? ''
  const next = lines[index + 1]?.text ?? ''
  return (
    /^(?:\s{0,3}#{1,6}\s+|\s{0,3}>|\s*[-+*]\s+|\s*\d+[.)]\s+|\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$)/u.test(
      text,
    ) ||
    Boolean(isFenceStart(text)) ||
    /^\s*(?:<!--|<[/!?A-Za-z]|:::+|\[\^[^\]]+\]:|!\[[^\]]*\]\([^\n]+\)\s*$)/u.test(text) ||
    (/\|/u.test(text) && isTableDivider(next))
  )
}

function rawInlineKind(text: string): RawMarkdownKind | null {
  if (/<!--|-->/u.test(text)) return 'comment'
  if (/<\/?[A-Za-z][^>]*>/u.test(text)) return 'html'
  if (/\[\^[^\]]+\]/u.test(text)) return 'footnote'
  if (/\{[{%]|[%}]\}/u.test(text)) return 'unknown'
  return null
}

function classifyBlock(lines: SourceLine[], index: number, firstContentBlock: boolean) {
  const text = lines[index].text
  const next = lines[index + 1]?.text ?? ''

  if (firstContentBlock && /^(---|\+\+\+)\s*$/u.test(text)) {
    return { kind: 'raw' as const, rawKind: 'frontmatter' as const }
  }
  if (/^\s*<!--/u.test(text)) return { kind: 'raw' as const, rawKind: 'comment' as const }
  if (/^\s*<[/!?A-Za-z]/u.test(text)) return { kind: 'raw' as const, rawKind: 'html' as const }
  if (/^\s*:::+/u.test(text)) return { kind: 'raw' as const, rawKind: 'directive' as const }
  if (/^\s*\[\^[^\]]+\]:/u.test(text)) return { kind: 'raw' as const, rawKind: 'footnote' as const }
  if (isFenceStart(text)) return { kind: 'code-block' as const, rawKind: null }
  if (/^\s{0,3}#{1,6}\s+/u.test(text)) return { kind: 'heading' as const, rawKind: null }
  if (/^\s{0,3}>/u.test(text)) return { kind: 'quote' as const, rawKind: null }
  if (/^\s*[-+*]\s+\[[ xX]\]\s+/u.test(text)) {
    return { kind: 'task-list' as const, rawKind: null }
  }
  if (/^\s*[-+*]\s+/u.test(text)) return { kind: 'bullet-list' as const, rawKind: null }
  if (/^\s*\d+[.)]\s+/u.test(text)) return { kind: 'ordered-list' as const, rawKind: null }
  if (/^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/u.test(text)) {
    return { kind: 'divider' as const, rawKind: null }
  }
  if (/\|/u.test(text) && isTableDivider(next)) return { kind: 'table' as const, rawKind: null }
  if (/^\s*!\[[^\]]*\]\([^\n]+\)\s*$/u.test(text)) {
    return { kind: 'image' as const, rawKind: null }
  }
  const inlineRawKind = rawInlineKind(text)
  return inlineRawKind
    ? { kind: 'raw' as const, rawKind: inlineRawKind }
    : { kind: 'paragraph' as const, rawKind: null }
}

function blockEnd(
  lines: SourceLine[],
  index: number,
  kind: MarkdownBlockKind,
  rawKind: RawMarkdownKind | null,
) {
  const start = index
  const fence = kind === 'code-block' ? isFenceStart(lines[index].text) : null
  index += 1

  if (fence) {
    const marker = fence[0]
    const size = fence.length
    while (index < lines.length) {
      if (new RegExp(`^\\s{0,3}${marker}{${size},}\\s*$`, 'u').test(lines[index].text)) {
        return index + 1
      }
      index += 1
    }
    return index
  }

  if (rawKind === 'frontmatter') {
    while (index < lines.length) {
      if (/^(---|\+\+\+)\s*$/u.test(lines[index].text)) return index + 1
      index += 1
    }
    return index
  }
  if (rawKind === 'comment') {
    if (/-->/u.test(lines[start].text)) return start + 1
    while (index < lines.length) {
      if (/-->/u.test(lines[index].text)) return index + 1
      index += 1
    }
    return index
  }
  if (rawKind === 'html' && /<\/[A-Za-z][^>]*>|\/>\s*$/u.test(lines[start].text)) {
    return start + 1
  }
  if (rawKind === 'directive') {
    while (index < lines.length) {
      if (/^\s*:::\s*$/u.test(lines[index].text)) return index + 1
      index += 1
    }
    return index
  }
  if (kind === 'heading' || kind === 'divider' || kind === 'image') return index

  while (index < lines.length && !isBlank(lines[index])) {
    if (index > start && startsNewBlock(lines, index)) break
    const inlineRawKind = rawInlineKind(lines[index].text)
    if (kind === 'paragraph' && inlineRawKind) {
      index += 1
      continue
    }
    index += 1
  }
  return index
}

function reconcileBlockIds(previous: MarkdownBlockDocument | undefined, blocks: MarkdownBlock[]) {
  if (!previous) return blocks
  const unused = new Set(previous.blocks.map((block) => block.id))

  return blocks.map((block, index) => {
    const exact = previous.blocks.find(
      (candidate) => unused.has(candidate.id) && candidate.rawSource === block.rawSource,
    )
    const positional = previous.blocks[index]
    const match =
      exact ??
      (positional && unused.has(positional.id) && positional.kind === block.kind
        ? positional
        : null)

    if (!match) return block
    unused.delete(match.id)
    return { ...block, id: match.id, visualJson: match.visualJson }
  })
}

export function parseMarkdownBlockDocument(
  source: string,
  previous?: MarkdownBlockDocument,
  options: { allowFrontmatter?: boolean } = {},
): MarkdownBlockDocument {
  const lines = sourceLines(source)
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const blockStartLine = index
    while (index < lines.length && isBlank(lines[index])) index += 1
    if (index >= lines.length) {
      if (blocks.length) {
        const last = blocks[blocks.length - 1]
        last.to = source.length
        last.rawSource = source.slice(last.from)
      }
      break
    }

    const contentLine = index
    let classification = classifyBlock(
      lines,
      contentLine,
      options.allowFrontmatter !== false && blocks.length === 0,
    )
    let endLine = blockEnd(lines, contentLine, classification.kind, classification.rawKind)
    if (classification.kind === 'paragraph') {
      for (let lineIndex = contentLine; lineIndex < endLine; lineIndex += 1) {
        const inlineRawKind = rawInlineKind(lines[lineIndex].text)
        if (inlineRawKind) {
          classification = { kind: 'raw', rawKind: inlineRawKind }
          break
        }
      }
    }
    while (endLine < lines.length && isBlank(lines[endLine])) endLine += 1

    const from = lines[blockStartLine].from
    const to = endLine < lines.length ? lines[endLine].from : source.length
    const rawSource = source.slice(from, to)
    const rawState = classification.kind === 'raw'
    blocks.push({
      id: `block-${stableHash(`${classification.kind}:${rawSource}`)}-${blocks.length}`,
      kind: classification.kind,
      rawKind: classification.rawKind,
      from,
      to,
      contentFrom: lines[contentLine].from,
      rawSource,
      visualJson: null,
      state: rawState ? 'raw' : 'untouched',
    })
    index = endLine
  }

  return { source, blocks: reconcileBlockIds(previous, blocks) }
}

export function serializeMarkdownBlockDocument(document: MarkdownBlockDocument) {
  return document.blocks.map((block) => block.rawSource).join('')
}

export function updateMarkdownBlockDocument(
  document: MarkdownBlockDocument,
  nextSource: string,
  patch: { from: number; to: number; insert: string },
) {
  if (!document.blocks.length || patch.from < 0 || patch.to < patch.from) {
    return parseMarkdownBlockDocument(nextSource, document)
  }
  const removed = document.source.slice(patch.from, patch.to)
  if (/```|~~~|^\s*(?:---|\+\+\+|:::|<!--|-->)\s*$/mu.test(`${removed}\n${patch.insert}`)) {
    return parseMarkdownBlockDocument(nextSource, document)
  }

  const firstAffected = document.blocks.findIndex((block) => patch.from <= block.to)
  const lastAffected = document.blocks.findLastIndex((block) => patch.to >= block.from)
  if (firstAffected < 0 || lastAffected < 0) {
    return parseMarkdownBlockDocument(nextSource, document)
  }

  const startIndex = Math.max(firstAffected - 1, 0)
  const endIndex = Math.min(lastAffected + 1, document.blocks.length - 1)
  const oldFrom = document.blocks[startIndex].from
  const oldTo = document.blocks[endIndex].to
  const delta = patch.insert.length - (patch.to - patch.from)
  const nextTo = Math.max(oldFrom, Math.min(oldTo + delta, nextSource.length))
  const previousWindow: MarkdownBlockDocument = {
    source: document.source.slice(oldFrom, oldTo),
    blocks: document.blocks.slice(startIndex, endIndex + 1).map((block) => ({
      ...block,
      from: block.from - oldFrom,
      to: block.to - oldFrom,
      contentFrom: block.contentFrom - oldFrom,
    })),
  }
  const reparsed = parseMarkdownBlockDocument(nextSource.slice(oldFrom, nextTo), previousWindow, {
    allowFrontmatter: oldFrom === 0,
  })
  const windowBlocks = reparsed.blocks.map((block) => ({
    ...block,
    from: block.from + oldFrom,
    to: block.to + oldFrom,
    contentFrom: block.contentFrom + oldFrom,
  }))
  const suffix = document.blocks.slice(endIndex + 1).map((block) => ({
    ...block,
    from: block.from + delta,
    to: block.to + delta,
    contentFrom: block.contentFrom + delta,
  }))
  return {
    source: nextSource,
    blocks: [...document.blocks.slice(0, startIndex), ...windowBlocks, ...suffix],
  }
}

export function logicalAnchorAtOffset(
  document: MarkdownBlockDocument,
  offset: number,
): LogicalSelectionAnchor | null {
  const block =
    document.blocks.find((candidate) => offset >= candidate.from && offset <= candidate.to) ??
    document.blocks.at(-1)
  if (!block) return null
  return {
    blockId: block.id,
    relativeOffset: Math.min(Math.max(offset - block.contentFrom, 0), block.rawSource.length),
  }
}

export function offsetForLogicalAnchor(
  document: MarkdownBlockDocument,
  anchor: LogicalSelectionAnchor,
) {
  const block = document.blocks.find((candidate) => candidate.id === anchor.blockId)
  if (!block) return null
  return Math.min(block.contentFrom + Math.max(anchor.relativeOffset, 0), block.to)
}

export function replaceMarkdownBlock(
  document: MarkdownBlockDocument,
  blockId: string,
  rawSource: string,
) {
  const block = document.blocks.find((candidate) => candidate.id === blockId)
  if (!block) return document
  const source = `${document.source.slice(0, block.from)}${rawSource}${document.source.slice(block.to)}`
  const next = parseMarkdownBlockDocument(source, document)
  const replacement = next.blocks.find((candidate) => candidate.id === blockId)
  if (replacement && replacement.kind !== 'raw') replacement.state = 'changed'
  return next
}

export function reorderMarkdownBlocks(
  document: MarkdownBlockDocument,
  selectedIds: readonly string[],
  targetIndex: number,
) {
  const selected = new Set(selectedIds)
  const moving = document.blocks.filter((block) => selected.has(block.id))
  if (!moving.length) return document
  const remaining = document.blocks.filter((block) => !selected.has(block.id))
  const removedBeforeTarget = document.blocks
    .slice(0, targetIndex)
    .filter((block) => selected.has(block.id)).length
  const insertionIndex = Math.min(Math.max(targetIndex - removedBeforeTarget, 0), remaining.length)
  const ordered = [
    ...remaining.slice(0, insertionIndex),
    ...moving,
    ...remaining.slice(insertionIndex),
  ]
  return parseMarkdownBlockDocument(ordered.map((block) => block.rawSource).join(''), {
    source: document.source,
    blocks: ordered,
  })
}
