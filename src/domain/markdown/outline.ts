export type MarkdownHeading = {
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  line: number
}

export type DocumentMapLine = {
  index: number
  kind: 'heading' | 'list' | 'text' | 'empty'
  width: number
  indent: number
}

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

export function buildDocumentMapLines(content: string): DocumentMapLine[] {
  const lines = content.split(/\r?\n/u)

  if (lines.length < 24) {
    return []
  }

  return lines.map((line, index) => {
    const trimmedLine = line.trim()
    const leadingSpaces = line.match(/^\s*/u)?.[0].length ?? 0
    const kind = /^(#{1,6})\s+/u.test(line)
      ? 'heading'
      : /^\s*(?:[-*+]|\d+[.)])\s+/u.test(line) ? 'list' : trimmedLine ? 'text' : 'empty'

    return {
      index,
      kind,
      width: kind === 'heading' ? 92 : Math.min(Math.max(trimmedLine.length * 2.2, 18), kind === 'list' ? 72 : 88),
      indent: Math.min(leadingSpaces * 3, 24),
    }
  })
}

export function findActiveHeading(
  headings: MarkdownHeading[],
  positions: Readonly<Record<string, number>>,
  scrollTop: number,
) {
  let activeHeading: MarkdownHeading | null = null

  for (const heading of headings) {
    const position = positions[heading.id]

    if (typeof position !== 'number' || position > scrollTop + 12) {
      continue
    }

    activeHeading = heading
  }

  return activeHeading?.id ?? headings[0]?.id ?? null
}
