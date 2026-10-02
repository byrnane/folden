export type TextMatch = { from: number; to: number }

export function findTextMatches(
  content: string,
  query: string,
  caseSensitive = false,
  limit = Infinity,
): TextMatch[] {
  if (!query) return []
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
    caseSensitive ? 'gu' : 'giu',
  )
  const matches: TextMatch[] = []
  for (const match of content.matchAll(expression)) {
    if (matches.length >= limit) break
    matches.push({ from: match.index, to: match.index + match[0].length })
  }
  return matches
}
