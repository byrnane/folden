export function fileNameFromPath(path: string) {
  return cleanDisplayPath(path).split(/[\\/]/).at(-1) || path
}

export function workspaceNameFromPath(path: string) {
  return fileNameFromPath(path) || path
}

export function parentPath(path: string) {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))

  if (index <= 0) {
    return null
  }

  return path.slice(0, index)
}

export function isMarkdownPath(path: string | null) {
  if (!path) {
    return true
  }

  return /\.(md|markdown)$/i.test(path)
}

export function isMarkdownDocument(document: { path: string | null; name: string }) {
  return isMarkdownPath(document.path ?? document.name)
}

export function cleanDisplayPath(path: string) {
  if (path.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${path.slice('\\\\?\\UNC\\'.length)}`
  }

  if (path.startsWith('\\\\?\\')) {
    return path.slice('\\\\?\\'.length)
  }

  return path
}

export function normalizePath(path: string) {
  const displayPath = cleanDisplayPath(path)
  const normalized = displayPath.replaceAll('\\', '/')
  const windowsPath =
    isWindowsPath(displayPath) ||
    (!displayPath.startsWith('/') &&
      typeof navigator !== 'undefined' &&
      /^Win/.test(navigator.platform))
  return windowsPath ? normalized.toLowerCase() : normalized
}

export function isWindowsPath(path: string) {
  return /^(?:[a-z]:|\\\\|\/\/)/iu.test(cleanDisplayPath(path))
}

export function joinWorkspacePath(rootPath: string, relativePath: string | null) {
  if (!relativePath) {
    return rootPath
  }

  const separator = isWindowsPath(rootPath) ? '\\' : '/'
  const relative = relativePath.replaceAll('\\', '/').replace(/^\/+/, '').replaceAll('/', separator)
  return `${rootPath.replace(/[\\/]+$/u, '')}${separator}${relative}`
}

export function recoveredCopyName(name: string) {
  const match = name.match(/^(.*?)(\.[^.]*)?$/)
  const stem = match?.[1] || name
  const extension = match?.[2] || ''
  return `${stem} (Recovered)${extension}`
}

export function suggestFileName(content: string) {
  return `${safeFileBaseName(readMarkdownTitle(content))}.md`
}

export function readMarkdownTitle(content: string) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]
  const fallbackText = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return heading ?? fallbackText ?? 'Untitled'
}

export function safeFileBaseName(source: string) {
  const cleanName = source
    .replace(/^[#>*\-\s]+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .replace(/[.\s]+$/g, '')

  return cleanName || 'Untitled'
}
