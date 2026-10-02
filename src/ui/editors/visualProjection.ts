import type { MarkdownBlockDocument } from '../../domain/markdown/blockDocument'
import { rawMarkdownMarker } from './rawMarkdownBlock'

export function buildVisualMarkdownProjection(
  source: string,
  blockDocument: MarkdownBlockDocument | null,
) {
  if (!blockDocument || blockDocument.source !== source) return source
  return blockDocument.blocks
    .map((block) =>
      block.kind === 'raw'
        ? `${block.rawKind === 'reference' ? `${block.rawSource}\n` : ''}${rawMarkdownMarker(block.rawKind ?? 'unknown', block.rawSource)}`
        : block.rawSource,
    )
    .join('')
}
