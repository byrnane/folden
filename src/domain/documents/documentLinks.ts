export function resolveDocumentLink(documentPath: string, href: string) {
  const [target, fragment = ''] = href.split('#', 2)
  const anchor = decodeURIComponent(fragment)
  if (!target) return { path: documentPath.replaceAll('\\', '/'), anchor }
  if (/^[a-z][a-z\d+.-]*:|^[\\/]/iu.test(target))
    throw new Error('Link must be relative to the project.')
  const parts = documentPath.replaceAll('\\', '/').split('/').slice(0, -1)
  for (const part of decodeURIComponent(target).replaceAll('\\', '/').split('/')) {
    if (part === '..') {
      if (!parts.length) throw new Error('Link is outside the project.')
      parts.pop()
    } else if (part && part !== '.') parts.push(part)
  }
  const path = parts.join('/')
  if (!/\.(md|markdown)$/iu.test(path))
    throw new Error('Only Markdown document links are supported.')
  return { path, anchor }
}
