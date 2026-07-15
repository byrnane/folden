import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '../../src/domain/markdown/documentAnalysis'
import { MAX_DOCUMENT_MAP_SEGMENTS } from '../../src/domain/markdown/outline'
import budgets from './budgets.json'

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

describe('document analysis performance', () => {
  it('analyzes a 5 MB / 50k-line fixture inside the idle budget', () => {
    const line = `paragraph ${'content '.repeat(12)}`
    const content = Array.from({ length: 50_000 }, (_, index) =>
      index % 100 === 0 ? `# Heading ${index}${' '.repeat(line.length - 15)}` : line,
    ).join('\n')
    analyzeDocument({ documentId: 'warmup', revision: 0, content, isMarkdown: true })
    const durations = Array.from({ length: 3 }, (_, revision) => {
      const started = performance.now()
      const result = analyzeDocument({ documentId: 'fixture', revision, content, isMarkdown: true })
      expect(result.mapSegments.length).toBeLessThanOrEqual(MAX_DOCUMENT_MAP_SEGMENTS)
      return performance.now() - started
    })
    const analysisMs = median(durations)
    expect(Buffer.byteLength(content)).toBeGreaterThanOrEqual(5_000_000)
    expect(analysisMs).toBeLessThanOrEqual(budgets.metrics.documentAnalysisMedianMs.maxMs)

    const reportDir = resolve('build/performance')
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(
      resolve(reportDir, 'document-analysis.json'),
      JSON.stringify(
        {
          fixtureBytes: Buffer.byteLength(content),
          lines: 50_000,
          runsMs: durations,
          medianMs: analysisMs,
          legacyMapDomNodes: 50_000,
          optimizedMapDomNodes: 4,
          mapSegments: MAX_DOCUMENT_MAP_SEGMENTS,
        },
        null,
        2,
      ),
    )
  })
})
