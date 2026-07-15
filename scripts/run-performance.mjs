import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportDir = path.join(rootDir, 'build', 'performance')
mkdirSync(reportDir, { recursive: true })

function run(label, command, args, env = process.env) {
  const started = performance.now()
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.status !== 0) process.exit(result.status ?? 1)
  return { label, durationMs: performance.now() - started, output: result.stdout ?? '' }
}

const vitestBin = path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs')
const documentRun = run('document', process.execPath, [
  vitestBin,
  'run',
  '--config',
  'vite.performance.config.ts',
])
const workspaceRun = run('workspace', 'cargo', [
  'test',
  '--release',
  '--manifest-path',
  'src-tauri/Cargo.toml',
  'performance_workspace_100k',
  '--',
  '--ignored',
  '--nocapture',
])
const workspaceMetrics = /FOLDEN_PERF:(\{[^\r\n]+\})/u.exec(workspaceRun.output)?.[1]
const browserRun = run(
  'browser',
  process.execPath,
  [path.join(rootDir, 'scripts', 'run-e2e.mjs'), 'tests/e2e/performance.spec.ts'],
  { ...process.env, FOLDEN_PERFORMANCE: '1' },
)

function readReport(name) {
  return JSON.parse(readFileSync(path.join(reportDir, name), 'utf8'))
}

const documentMetrics = readReport('document-analysis.json')
const browserDocumentMetrics = readReport('browser-document.json')
const browserWorkspaceMetrics = readReport('browser-workspace.json')
const workspace = workspaceMetrics ? JSON.parse(workspaceMetrics) : null
const metrics = {
  documentAnalysisMedianMs: documentMetrics.medianMs,
  rootListingMedianMs: workspace?.rootListingMedianMs ?? null,
  traversalMedianMs: workspace?.traversalMedianMs ?? null,
  inputP95Ms: browserDocumentMetrics.inputP95Ms,
  documentSettledMedianMs: browserDocumentMetrics.analysisMedianMs,
  directoryRenderMedianMs: browserWorkspaceMetrics.directoryMedianMs,
}
const machine = {
  platform: process.platform,
  arch: process.arch,
  cpuModel: os.cpus()[0]?.model ?? 'unknown',
}
const baselinePath = path.join(rootDir, 'tests', 'performance', 'baseline.json')
if (!existsSync(baselinePath))
  throw new Error(`Missing accepted performance baseline: ${baselinePath}`)
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const sameMachine =
  baseline.machine?.platform === machine.platform &&
  baseline.machine?.arch === machine.arch &&
  baseline.machine?.cpuModel === machine.cpuModel
const baselineMetrics = baseline.metrics ?? {}
const regressions = Object.entries(metrics).flatMap(([name, value]) => {
  if (!sameMachine) return []
  const baselineValue = baselineMetrics[name]
  const measurementFloor = 1
  if (
    typeof value !== 'number' ||
    typeof baselineValue !== 'number' ||
    Math.max(value, measurementFloor) <= Math.max(baselineValue, measurementFloor) * 1.15
  ) {
    return []
  }
  return [{ name, baseline: baselineValue, current: value }]
})

writeFileSync(
  path.join(reportDir, 'summary.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      documentCommandMs: documentRun.durationMs,
      workspaceCommandMs: workspaceRun.durationMs,
      browserCommandMs: browserRun.durationMs,
      workspace,
      metrics,
      baseline,
      machine,
      relativeComparison: sameMachine ? 'applied' : 'skipped-machine-mismatch',
      regressions,
    },
    null,
    2,
  ),
)

if (regressions.length > 0) {
  console.error(`Performance regression exceeded 15%: ${JSON.stringify(regressions)}`)
  process.exit(1)
}
