import { isRelativeMarkdownUrl, isRemoteImageUrl } from './markdownSafety'

export type ResolvedVisualImage =
  | {
      kind: 'image'
      renderedSrc: string
    }
  | {
      kind: 'placeholder'
      reason: string
    }

export type ResolveVisualImageSourceOptions = {
  source: string | null | undefined
  documentPath: string | null
  workspaceRootPath: string | null
  allowRemoteImages: boolean
}

function splitLocalPath(path: string) {
  const normalizedPath = path.replaceAll('\\', '/')
  const driveMatch = normalizedPath.match(/^[A-Za-z]:/)
  const drive = driveMatch?.[0] ?? ''
  const unc = !drive ? normalizedPath.match(/^\/\/[^/]+\/[^/]+/)?.[0] : null
  const root = drive ? `${drive}/` : unc ? `${unc}/` : normalizedPath.startsWith('/') ? '/' : ''

  return {
    root,
    windows: Boolean(drive || unc),
    segments: normalizedPath
      .slice(root.length)
      .split('/')
      .filter((segment) => segment.length > 0),
  }
}

function joinLocalPath(root: string, segments: string[], windows: boolean) {
  const path = `${root}${segments.join('/')}`
  return windows ? path.replaceAll('/', '\\') : path
}

function parentLocalPath(path: string) {
  const { root, segments, windows } = splitLocalPath(path)
  return joinLocalPath(root, segments.slice(0, -1), windows)
}

function resolveLocalPath(basePath: string, relativePath: string) {
  const { root, segments, windows } = splitLocalPath(basePath)
  const nextSegments = [...segments]

  for (const segment of relativePath.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      if (nextSegments.length > 0) {
        nextSegments.pop()
      }
      continue
    }

    nextSegments.push(segment)
  }

  return joinLocalPath(root, nextSegments, windows)
}

function splitPathSuffix(value: string) {
  const match = value.match(/^([^?#]*)([?#].*)?$/)

  return {
    path: match?.[1] ?? value,
    suffix: match?.[2] ?? '',
  }
}

export function resolveRelativeImagePath(
  source: string,
  documentPath: string | null,
  workspaceRootPath: string | null,
) {
  const { path, suffix } = splitPathSuffix(source)

  if (!path || path === '#') {
    return null
  }

  const basePath = /^[\\/]/.test(path)
    ? workspaceRootPath
    : documentPath
      ? parentLocalPath(documentPath)
      : null

  if (!basePath) {
    return null
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(path)
  } catch {
    return null
  }
  const relativePath = decodedPath.replace(/^[\\/]+/, '')
  return `${resolveLocalPath(basePath, relativePath)}${suffix}`
}

export function resolveVisualImageSource(
  { source, documentPath, workspaceRootPath, allowRemoteImages }: ResolveVisualImageSourceOptions,
  convertLocalPath: (path: string) => string = (path) => path,
): ResolvedVisualImage {
  const normalizedSource = source?.trim() ?? ''

  if (!normalizedSource) {
    return {
      kind: 'placeholder',
      reason: 'Image source is empty.',
    }
  }

  if (isRemoteImageUrl(normalizedSource)) {
    return allowRemoteImages
      ? {
          kind: 'image',
          renderedSrc: normalizedSource,
        }
      : {
          kind: 'placeholder',
          reason: 'Remote image is blocked. Use Load remote images for this document.',
        }
  }

  if (/^(data|asset):/i.test(normalizedSource)) {
    return {
      kind: 'image',
      renderedSrc: normalizedSource,
    }
  }

  if (!isRelativeMarkdownUrl(normalizedSource)) {
    return {
      kind: 'placeholder',
      reason: 'Unsupported image URL.',
    }
  }

  const resolvedPath = resolveRelativeImagePath(normalizedSource, documentPath, workspaceRootPath)

  if (!resolvedPath) {
    return {
      kind: 'placeholder',
      reason: 'Save the document inside a workspace to preview this local image.',
    }
  }

  return {
    kind: 'image',
    renderedSrc: convertLocalPath(resolvedPath),
  }
}
