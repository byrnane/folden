export type MarkdownUnsupportedFeature = {
  kind: string
  line: number | null
  description: string
}

export type MarkdownSafetyReport = {
  safeForVisualEditing: boolean
  unsupportedFeatures: MarkdownUnsupportedFeature[]
  remoteImages: {
    line: number | null
    source: string
  }[]
}

const allowedLinkSchemes = new Set(['http', 'https', 'mailto'])
const supportedImageSchemes = new Set(['data', 'asset'])

function lineNumberAt(source: string, index: number) {
  if (index < 0) {
    return null
  }

  return source.slice(0, index).split(/\r?\n/).length
}

function addFeature(
  features: MarkdownUnsupportedFeature[],
  kind: string,
  line: number | null,
  description: string,
) {
  if (features.some((feature) => feature.kind === kind && feature.line === line)) {
    return
  }

  features.push({ kind, line, description })
}

function findLineMatches(
  source: string,
  expression: RegExp,
  kind: string,
  description: string,
  features: MarkdownUnsupportedFeature[],
) {
  const lines = source.split(/\r?\n/)

  lines.forEach((line, index) => {
    if (expression.test(line)) {
      addFeature(features, kind, index + 1, description)
    }
  })
}

export function isRelativeMarkdownUrl(value: string) {
  return /^(#|\/|\.{1,2}\/|[^:?#\s][^:\s]*)/.test(value)
    && !/^[a-z][a-z0-9+.-]*:/i.test(value)
}

export function normalizeLinkTarget(value: string) {
  return value.trim()
}

export function validateLinkTarget(value: string) {
  const normalizedValue = normalizeLinkTarget(value)

  if (normalizedValue === '') {
    return null
  }

  if (isRelativeMarkdownUrl(normalizedValue)) {
    return null
  }

  const schemeMatch = normalizedValue.match(/^([a-z][a-z0-9+.-]*):/i)

  if (!schemeMatch) {
    return 'Only relative, http, https, and mailto links are supported.'
  }

  const scheme = schemeMatch[1].toLowerCase()

  if (!allowedLinkSchemes.has(scheme)) {
    return scheme === 'javascript'
      ? 'javascript: links are not allowed.'
      : 'This link scheme is not allowed.'
  }

  return null
}

export function isRemoteImageUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}

export function validateImageTarget(value: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return 'Image URL is required.'
  }

  if (isRemoteImageUrl(normalizedValue)) {
    return null
  }

  if (isRelativeMarkdownUrl(normalizedValue)) {
    return null
  }

  const schemeMatch = normalizedValue.match(/^([a-z][a-z0-9+.-]*):/i)

  if (!schemeMatch) {
    return 'Only relative, asset:, and data: image URLs are supported.'
  }

  return supportedImageSchemes.has(schemeMatch[1].toLowerCase())
    ? null
    : 'Only relative, asset:, and data: image URLs are supported.'
}

export function analyzeMarkdownSafety(source: string): MarkdownSafetyReport {
  const unsupportedFeatures: MarkdownUnsupportedFeature[] = []
  const remoteImages: MarkdownSafetyReport['remoteImages'] = []

  if (/^(---|\+\+\+)\s*$/m.test(source.trimStart())) {
    const firstLine = source.split(/\r?\n/)[0] ?? ''

    if (/^(---|\+\+\+)\s*$/.test(firstLine)) {
      addFeature(unsupportedFeatures, 'frontmatter', 1, 'Frontmatter is not supported in Visual mode.')
    }
  }

  const lines = source.split(/\r?\n/)

  for (let index = 0; index < lines.length - 1; index += 1) {
    const currentLine = lines[index]
    const nextLine = lines[index + 1]

    if (
      /^\s*\|.+\|\s*$/u.test(currentLine)
      && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/u.test(nextLine)
    ) {
      addFeature(unsupportedFeatures, 'table', index + 1, 'Tables are not supported in Visual mode.')
    }
  }
  findLineMatches(
    source,
    /^\s*[-*+]\s+\[[ xX]\]\s+/u,
    'task-list',
    'Task lists are not supported in Visual mode.',
    unsupportedFeatures,
  )
  findLineMatches(
    source,
    /^\[\^[^\]]+\]:/u,
    'footnote',
    'Footnotes are not supported in Visual mode.',
    unsupportedFeatures,
  )
  findLineMatches(
    source,
    /<!--|-->/u,
    'comment',
    'HTML comments are not supported in Visual mode.',
    unsupportedFeatures,
  )
  findLineMatches(
    source,
    /^\s*<([A-Za-z!/][^>]*)>/u,
    'html',
    'Raw HTML is not supported in Visual mode.',
    unsupportedFeatures,
  )
  findLineMatches(
    source,
    /^\s*:::+/u,
    'directive',
    'Custom directives are not supported in Visual mode.',
    unsupportedFeatures,
  )

  const remoteImageExpression = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gi
  let remoteImageMatch = remoteImageExpression.exec(source)

  while (remoteImageMatch) {
    remoteImages.push({
      line: lineNumberAt(source, remoteImageMatch.index),
      source: remoteImageMatch[1],
    })
    remoteImageMatch = remoteImageExpression.exec(source)
  }

  return {
    safeForVisualEditing: unsupportedFeatures.length === 0,
    unsupportedFeatures,
    remoteImages,
  }
}
