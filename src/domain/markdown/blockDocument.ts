import { Marked, type Token, type Tokens } from 'marked'

// Editor schema tokenizers must not change source block boundaries or make
// this lexer scan the remaining document for every block.
const blockLexer = new Marked()

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
  'frontmatter' | 'html' | 'comment' | 'footnote' | 'directive' | 'reference' | 'unknown'

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
  normalizedFrom: number
}

type BlockDocumentChange = {
  previousFrom: number
  previousTo: number
  nextFrom: number
  nextTo: number
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  const expression = /[^\r\n]*(?:\r\n|\r|\n|$)/gu
  let match = expression.exec(source)
  let normalizedFrom = 0

  while (match && match[0]) {
    const raw = match[0]
    const from = match.index
    lines.push({
      from,
      to: from + raw.length,
      raw,
      text: raw.replace(/(?:\r\n|\r|\n)$/u, ''),
      normalizedFrom,
    })
    normalizedFrom += raw.replace(/\r\n?/gu, '\n').length
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

function tokensContainImage(tokens: Token[]): boolean {
  return tokens.some(
    (token) =>
      token.type === 'image' ||
      ('tokens' in token && Array.isArray(token.tokens) && tokensContainImage(token.tokens)),
  )
}

function unsupportedTokenKind(token: Token): RawMarkdownKind | null {
  if (token.type === 'html') return /<!--/u.test(token.raw) ? 'comment' : 'html'
  if (token.type === 'text') {
    const rawKind = rawInlineKind(token.raw)
    if (rawKind) return rawKind
    if ('tokens' in token && Array.isArray(token.tokens) && tokensContainImage(token.tokens))
      return 'unknown'
    return null
  }
  if (token.type === 'code' || token.type === 'codespan' || token.type === 'link') return null
  if (token.type === 'table') {
    const table = token as Tokens.Table
    if ([...table.header, ...table.rows.flat()].some((cell) => tokensContainImage(cell.tokens)))
      return 'unknown'
  }
  const children =
    'tokens' in token && Array.isArray(token.tokens)
      ? token.tokens
      : token.type === 'list'
        ? (token as Tokens.List).items.flatMap((item) => item.tokens)
        : []
  // The Visual schema has block images, so an image mixed with paragraph
  // text must stay raw rather than becoming an invalid inline child.
  if (
    tokensContainImage(children) &&
    (token.type === 'heading' ||
      (token.type === 'paragraph' &&
        (children.filter((child) => child.type === 'image').length > 1 ||
          children.some((child) => child.type !== 'image' && child.raw.trim() !== ''))))
  )
    return 'unknown'
  for (const child of children) {
    const kind = unsupportedTokenKind(child)
    if (kind) return kind
  }
  return null
}

function classifyBlock(
  lines: SourceLine[],
  index: number,
  firstContentBlock: boolean,
  token?: Token,
) {
  const text = lines[index].text
  const next = lines[index + 1]?.text ?? ''

  if (
    firstContentBlock &&
    /^(---|\+\+\+)\s*$/u.test(text) &&
    lines.slice(index + 1).some((line) => /^(---|\+\+\+)\s*$/u.test(line.text))
  ) {
    return { kind: 'raw' as const, rawKind: 'frontmatter' as const }
  }
  if (/^\s*<!--/u.test(text)) return { kind: 'raw' as const, rawKind: 'comment' as const }
  if (token?.type === 'html') return { kind: 'raw' as const, rawKind: 'html' as const }
  if (/^\s*:::+/u.test(text)) return { kind: 'raw' as const, rawKind: 'directive' as const }
  if (/^\s*\[\^[^\]]+\]:/u.test(text)) return { kind: 'raw' as const, rawKind: 'footnote' as const }
  if (token?.type === 'def') return { kind: 'raw' as const, rawKind: 'reference' as const }
  if (token) {
    const rawKind = unsupportedTokenKind(token)
    if (rawKind) return { kind: 'raw' as const, rawKind }
    if (token.type === 'heading') return { kind: 'heading' as const, rawKind: null }
    if (token.type === 'code') return { kind: 'code-block' as const, rawKind: null }
    if (token.type === 'blockquote') return { kind: 'quote' as const, rawKind: null }
    if (token.type === 'hr') return { kind: 'divider' as const, rawKind: null }
    if (token.type === 'table') return { kind: 'table' as const, rawKind: null }
    if (token.type === 'list') {
      const list = token as Tokens.List
      return {
        kind: list.items.some((item) => item.task)
          ? ('task-list' as const)
          : list.ordered
            ? ('ordered-list' as const)
            : ('bullet-list' as const),
        rawKind: null,
      }
    }
    return {
      kind: /^\s*!\[/u.test(text) ? ('image' as const) : ('paragraph' as const),
      rawKind: null,
    }
  }
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

function sameBlockIdentity(first: MarkdownBlock, second: MarkdownBlock) {
  return first.kind === second.kind && first.rawSource === second.rawSource
}

function reconcileBlockIds(
  previous: MarkdownBlockDocument | undefined,
  blocks: MarkdownBlock[],
  change?: BlockDocumentChange,
) {
  if (!previous) return blocks
  const previousDocument = previous
  const result = blocks.map((block) => ({ ...block }))
  const matchedPrevious = new Set<number>()
  const matchedNext = new Set<number>()

  function preserve(previousIndex: number, nextIndex: number) {
    if (matchedPrevious.has(previousIndex) || matchedNext.has(nextIndex)) return false
    const previousBlock = previousDocument.blocks[previousIndex]
    const nextBlock = result[nextIndex]
    if (!previousBlock || !nextBlock) return false
    matchedPrevious.add(previousIndex)
    matchedNext.add(nextIndex)
    result[nextIndex] = {
      ...nextBlock,
      id: previousBlock.id,
      visualJson: previousBlock.visualJson,
    }
    return true
  }

  if (change) {
    const delta = change.nextTo - change.nextFrom - (change.previousTo - change.previousFrom)
    previousDocument.blocks.forEach((previousBlock, previousIndex) => {
      const expectedFrom =
        previousBlock.to <= change.previousFrom
          ? previousBlock.from
          : previousBlock.from >= change.previousTo
            ? previousBlock.from + delta
            : null
      if (expectedFrom === null) return
      const nextIndex = result.findIndex(
        (nextBlock, candidateIndex) =>
          !matchedNext.has(candidateIndex) &&
          nextBlock.from === expectedFrom &&
          sameBlockIdentity(previousBlock, nextBlock),
      )
      if (nextIndex >= 0) preserve(previousIndex, nextIndex)
    })

    previousDocument.blocks.forEach((previousBlock, previousIndex) => {
      if (matchedPrevious.has(previousIndex)) return
      const nextIndex = result.findIndex(
        (nextBlock, candidateIndex) =>
          !matchedNext.has(candidateIndex) && sameBlockIdentity(previousBlock, nextBlock),
      )
      if (nextIndex >= 0) preserve(previousIndex, nextIndex)
    })

    const touchesChangedRange = (from: number, to: number, rangeFrom: number, rangeTo: number) =>
      rangeFrom === rangeTo
        ? from <= rangeFrom && to >= rangeFrom
        : from < rangeTo && to > rangeFrom
    const changedPrevious = previousDocument.blocks
      .map((block, index) => ({ block, index }))
      .filter(
        ({ index, block }) =>
          !matchedPrevious.has(index) &&
          touchesChangedRange(block.from, block.to, change.previousFrom, change.previousTo),
      )
    const changedNext = result
      .map((block, index) => ({ block, index }))
      .filter(
        ({ index, block }) =>
          !matchedNext.has(index) &&
          touchesChangedRange(block.from, block.to, change.nextFrom, change.nextTo),
      )
    if (changedPrevious.length === 1 && changedNext.length === 1) {
      preserve(changedPrevious[0].index, changedNext[0].index)
    }
    for (let index = 0; index < Math.min(changedPrevious.length, changedNext.length); index += 1) {
      if (changedPrevious[index].block.kind === changedNext[index].block.kind) {
        preserve(changedPrevious[index].index, changedNext[index].index)
      }
    }
  }

  previousDocument.blocks.forEach((previousBlock, previousIndex) => {
    if (matchedPrevious.has(previousIndex)) return
    const nextIndex = result.findIndex(
      (nextBlock, candidateIndex) =>
        !matchedNext.has(candidateIndex) && sameBlockIdentity(previousBlock, nextBlock),
    )
    if (nextIndex >= 0) preserve(previousIndex, nextIndex)
  })

  result.forEach((nextBlock, nextIndex) => {
    if (matchedNext.has(nextIndex)) return
    const previousBlock = previousDocument.blocks[nextIndex]
    if (previousBlock && !matchedPrevious.has(nextIndex) && previousBlock.kind === nextBlock.kind) {
      preserve(nextIndex, nextIndex)
    }
  })

  const usedIds = new Set(
    result.filter((_, index) => matchedNext.has(index)).map((block) => block.id),
  )
  result.forEach((block, index) => {
    if (matchedNext.has(index) && usedIds.has(block.id)) return
    let id = block.id
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${block.id}-${suffix}`
      suffix += 1
    }
    result[index] = { ...block, id }
    usedIds.add(id)
  })
  return result
}

export function parseMarkdownBlockDocument(
  source: string,
  previous?: MarkdownBlockDocument,
  options: { allowFrontmatter?: boolean; change?: BlockDocumentChange } = {},
): MarkdownBlockDocument {
  const lines = sourceLines(source)
  const tokensByOffset = new Map<number, Token>()
  let tokenOffset = 0
  for (const token of blockLexer.lexer(source)) {
    if (token.type !== 'space') tokensByOffset.set(tokenOffset, token)
    tokenOffset += token.raw.length
  }
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
    const token = tokensByOffset.get(lines[contentLine].normalizedFrom)
    let classification = classifyBlock(
      lines,
      contentLine,
      options.allowFrontmatter !== false && blocks.length === 0,
      token,
    )
    let endLine = blockEnd(lines, contentLine, classification.kind, classification.rawKind)
    if (
      token &&
      classification.rawKind !== 'frontmatter' &&
      classification.rawKind !== 'directive' &&
      classification.rawKind !== 'footnote'
    ) {
      const tokenEnd = lines[contentLine].normalizedFrom + token.raw.length
      endLine = contentLine + 1
      while (endLine < lines.length && lines[endLine].normalizedFrom < tokenEnd) endLine += 1
    }
    if (!token && classification.kind === 'paragraph') {
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

  if (!blocks.length && source.length) {
    blocks.push({
      id: `block-${stableHash(`paragraph:${source}`)}-0`,
      kind: 'paragraph',
      rawKind: null,
      from: 0,
      to: source.length,
      contentFrom: 0,
      rawSource: source,
      visualJson: null,
      state: 'untouched',
    })
  }

  return { source, blocks: reconcileBlockIds(previous, blocks, options.change) }
}

export function serializeMarkdownBlockDocument(document: MarkdownBlockDocument) {
  return document.blocks.map((block) => block.rawSource).join('')
}

export function assertMarkdownBlockDocument(document: MarkdownBlockDocument) {
  const ids = new Set<string>()
  let expectedFrom = 0

  for (const [index, block] of document.blocks.entries()) {
    const fail = (message: string): never => {
      throw new Error(`Block Document invariant failed at block ${index}: ${message}`)
    }
    if (!block.id || ids.has(block.id)) fail(`duplicate or empty id "${block.id}"`)
    ids.add(block.id)
    if (block.from !== expectedFrom) fail(`expected from=${expectedFrom}, received ${block.from}`)
    if (block.to < block.from || block.to > document.source.length) fail('invalid source range')
    if (block.contentFrom < block.from || block.contentFrom > block.to) {
      fail('contentFrom is outside the block range')
    }
    if (block.rawSource !== document.source.slice(block.from, block.to)) {
      fail('rawSource does not match the document source')
    }
    if (block.kind === 'raw') {
      if (!block.rawKind || block.state !== 'raw') fail('raw block metadata is inconsistent')
    } else if (block.rawKind !== null || block.state === 'raw') {
      fail('visual block metadata is inconsistent')
    }
    expectedFrom = block.to
  }

  if (expectedFrom !== document.source.length) {
    throw new Error(
      `Block Document invariant failed: blocks end at ${expectedFrom}, source ends at ${document.source.length}`,
    )
  }
  if (serializeMarkdownBlockDocument(document) !== document.source) {
    throw new Error('Block Document invariant failed: serialized blocks differ from source')
  }
}

export function updateMarkdownBlockDocument(
  document: MarkdownBlockDocument,
  nextSource: string,
  patch: { from: number; to: number; insert: string },
) {
  if (!document.blocks.length || patch.from < 0 || patch.to < patch.from) {
    return parseMarkdownBlockDocument(nextSource, document)
  }
  const change = {
    previousFrom: patch.from,
    previousTo: patch.to,
    nextFrom: patch.from,
    nextTo: patch.from + patch.insert.length,
  }
  const removed = document.source.slice(patch.from, patch.to)
  if (/```|~~~|^\s*(?:---|\+\+\+|:::|<!--|-->)\s*$/mu.test(`${removed}\n${patch.insert}`)) {
    return parseMarkdownBlockDocument(nextSource, document, { change })
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
    change: {
      previousFrom: patch.from - oldFrom,
      previousTo: patch.to - oldFrom,
      nextFrom: patch.from - oldFrom,
      nextTo: patch.from - oldFrom + patch.insert.length,
    },
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
  const next = parseMarkdownBlockDocument(source, document, {
    change: {
      previousFrom: block.from,
      previousTo: block.to,
      nextFrom: block.from,
      nextTo: block.from + rawSource.length,
    },
  })
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
