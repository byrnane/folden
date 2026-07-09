import type { OpenDocument } from './documentState'

export type DocumentDisplayLabel = {
  id: string
  label: string
  title: string
}

function cleanPath(value: string) {
  return value.replaceAll('\\', '/').replace(/\/+/gu, '/').replace(/^\/|\/$/gu, '')
}

function documentPathParts(document: OpenDocument, cleanDisplayPath: (path: string) => string) {
  if (!document.path) {
    return [document.name]
  }

  const path = document.relativePath ?? cleanDisplayPath(document.path)
  const cleanedPath = cleanPath(path)
  const parts = cleanedPath.split('/').filter(Boolean)

  return parts.length ? parts : [document.name]
}

export function buildDocumentDisplayLabels(
  documents: readonly OpenDocument[],
  cleanDisplayPath: (path: string) => string,
): Record<string, DocumentDisplayLabel> {
  const groups = new Map<string, OpenDocument[]>()

  for (const document of documents) {
    const group = groups.get(document.name) ?? []
    group.push(document)
    groups.set(document.name, group)
  }

  const labels: Record<string, DocumentDisplayLabel> = {}

  for (const document of documents) {
    const group = groups.get(document.name) ?? []
    const title = document.path ? cleanDisplayPath(document.path) : 'Scratch document'

    labels[document.id] = {
      id: document.id,
      label: group.length > 1 ? '' : document.name,
      title,
    }
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue
    }

    const partsByDocument = new Map(group.map((document) => [
      document.id,
      documentPathParts(document, cleanDisplayPath),
    ]))
    const maxDepth = Math.max(...[...partsByDocument.values()].map((parts) => parts.length))
    let depth = 1

    while (depth <= maxDepth) {
      const seen = new Set<string>()
      let unique = true

      for (const document of group) {
        const parts = partsByDocument.get(document.id) ?? [document.name]
        const label = parts.slice(Math.max(parts.length - depth, 0)).join('/')
        if (seen.has(label)) {
          unique = false
          break
        }
        seen.add(label)
      }

      if (unique) {
        break
      }

      depth += 1
    }

    for (const document of group) {
      const parts = partsByDocument.get(document.id) ?? [document.name]
      labels[document.id].label = parts.slice(Math.max(parts.length - depth, 0)).join('/')
    }
  }

  return labels
}
