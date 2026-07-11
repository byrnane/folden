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

function splitWindowsPath(path: string) {
  const normalizedPath = path.replace(/\//g, '\\')
  const driveMatch = normalizedPath.match(/^[A-Za-z]:/)
  const drive = driveMatch?.[0] ?? ''
  const remainder = drive ? normalizedPath.slice(drive.length) : normalizedPath

  return {
    drive,
    segments: remainder.split('\\').filter((segment) => segment.length > 0),
  }
}

function joinWindowsPath(drive: string, segments: string[]) {
  if (!drive) {
    return segments.join('\\')
  }

  return segments.length > 0 ? `${drive}\\${segments.join('\\')}` : `${drive}\\`
}

function parentWindowsPath(path: string) {
  const { drive, segments } = splitWindowsPath(path)

  if (segments.length === 0) {
    return joinWindowsPath(drive, segments)
  }

  return joinWindowsPath(drive, segments.slice(0, -1))
}

function resolveWindowsPath(basePath: string, relativePath: string) {
  const { drive, segments } = splitWindowsPath(basePath)
  const nextSegments = [...segments]

  for (const segment of relativePath.replace(/\//g, '\\').split('\\')) {
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

  return joinWindowsPath(drive, nextSegments)
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
      ? parentWindowsPath(documentPath)
      : null

  if (!basePath) {
    return null
  }

  const relativePath = path.replace(/^[\\/]+/, '')
  return `${resolveWindowsPath(basePath, relativePath)}${suffix}`
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
