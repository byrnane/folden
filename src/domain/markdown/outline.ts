export type MarkdownHeading = {
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  line: number
}

export const MAX_DOCUMENT_MAP_SEGMENTS = 512

export type DocumentMapSegment = {
  index: number
  position: number
  kind: 'heading' | 'list' | 'text' | 'empty'
  width: number
  indent: number
}

export type DocumentMapLine = DocumentMapSegment

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/gu, '-')
}

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  const slugCounts = new Map<string, number>()
  let inFence = false

  content.split(/\r?\n/u).forEach((line, index) => {
    if (/^\s{0,3}(```|~~~)/u.test(line)) {
      inFence = !inFence
      return
    }

    if (inFence) {
      return
    }

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line)
    if (!match) {
      return
    }

    const text = match[2].trim()
    if (!text) {
      return
    }

    const baseSlug = slugifyHeading(text) || `heading-${index + 1}`
    const seenCount = slugCounts.get(baseSlug) ?? 0
    slugCounts.set(baseSlug, seenCount + 1)

    headings.push({
      id: seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount}`,
      level: match[1].length as MarkdownHeading['level'],
      text,
      line: index + 1,
    })
  })

  return headings
}

function mapLine(line: string, index: number, totalLines: number): DocumentMapSegment {
  const trimmedLine = line.trim()
  const leadingSpaces = line.match(/^\s*/u)?.[0].length ?? 0
  const kind = /^(#{1,6})\s+/u.test(line)
    ? 'heading'
    : /^\s*(?:[-*+]|\d+[.)])\s+/u.test(line)
      ? 'list'
      : trimmedLine
        ? 'text'
        : 'empty'

  return {
    index,
    position: index / Math.max(totalLines - 1, 1),
    kind,
    width:
      kind === 'heading'
        ? 92
        : Math.min(Math.max(trimmedLine.length * 2.2, 18), kind === 'list' ? 72 : 88),
    indent: Math.min(leadingSpaces * 3, 24),
  }
}

export function buildDocumentMapLines(content: string): DocumentMapSegment[] {
  if (!content.trim()) {
    return []
  }

  const lines = content.split(/\r?\n/u)

  if (lines.length <= MAX_DOCUMENT_MAP_SEGMENTS) {
    return lines.map((line, index) => mapLine(line, index, lines.length))
  }

  const bucketSize = lines.length / MAX_DOCUMENT_MAP_SEGMENTS
  return Array.from({ length: MAX_DOCUMENT_MAP_SEGMENTS }, (_, bucketIndex) => {
    const start = Math.floor(bucketIndex * bucketSize)
    const end = Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize))
    let selected = mapLine(lines[start], start, lines.length)
    const priority = { empty: 0, text: 1, list: 2, heading: 3 } as const
    for (let index = start + 1; index < end; index += 1) {
      const candidate = mapLine(lines[index], index, lines.length)
      if (priority[candidate.kind] > priority[selected.kind]) selected = candidate
      if (selected.kind === 'heading') break
    }
    return selected
  })
}

export function findActiveHeading(
  headings: MarkdownHeading[],
  positions: Readonly<Record<string, number>>,
  scrollTop: number,
) {
  let low = 0
  let high = headings.length - 1
  let activeIndex = -1
  const target = scrollTop + 12

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const position = positions[headings[middle].id]
    if (typeof position === 'number' && position <= target) {
      activeIndex = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return headings[activeIndex]?.id ?? headings[0]?.id ?? null
}

export function findActiveHeadingByLine(headings: MarkdownHeading[], line: number) {
  let low = 0
  let high = headings.length - 1
  let activeIndex = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (headings[middle].line <= line) {
      activeIndex = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return headings[activeIndex]?.id ?? headings[0]?.id ?? null
}
