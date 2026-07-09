export type MarkdownHeading = {
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  line: number
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
