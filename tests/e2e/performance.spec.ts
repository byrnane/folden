import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaultApplicationSettings } from '../../src/application/settings/defaults'
import { applicationSettingsStorageKey, openApp, sourceEditor } from './helpers'

test.skip(!process.env.FOLDEN_PERFORMANCE, 'runs through npm run test:performance')
test.setTimeout(60_000)

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(Math.ceil(sorted.length * percentileValue) - 1, sorted.length - 1)]
}

function median(values: number[]) {
  return percentile(values, 0.5)
}

function writePerformanceReport(name: string, report: unknown) {
  const reportDir = resolve('build/performance')
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(resolve(reportDir, name), JSON.stringify(report, null, 2))
}

test('large document analysis stays off the editing hot path', async ({ page }) => {
  const line = `paragraph ${'content '.repeat(12)}`
  const content = Array.from({ length: 50_000 }, (_, index) =>
    index % 100 === 0 ? `# Heading ${index}${' '.repeat(line.length - 15)}` : line,
  ).join('\n')
  await openApp(page, {
    storageEntries: {
      [applicationSettingsStorageKey]: JSON.stringify({
        ...defaultApplicationSettings,
        editor: { ...defaultApplicationSettings.editor, defaultMarkdownMode: 'source' },
      }),
    },
    mockOptions: { initialFiles: { 'large.md': content, 'small.md': '# Small' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-large.md').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(sourceEditor(page)).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Document map' })).toBeVisible()
  await page.getByTestId('workspace-entry-small.md').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  const tabs = page.locator('.editor-pane').first().locator('.pane-tabs .tab-button')
  const largeTab = tabs.filter({ hasText: 'large.md' })
  const smallTab = tabs.filter({ hasText: 'small.md' })
  await largeTab.click()
  await expect(sourceEditor(page)).toBeVisible()
  await expect(page.locator('.document-map-line')).toHaveCount(0)
  await expect(page.locator('canvas.document-map-content')).toHaveCount(1)
  await smallTab.click()
  await expect(sourceEditor(page)).toBeVisible()
  await largeTab.click()
  await expect(sourceEditor(page)).toBeVisible()
  const mapSizes = await page
    .getByRole('complementary', { name: 'Document map' })
    .evaluate((map) => {
      const canvas = map.querySelector('canvas')!
      return {
        canvasCssHeight: canvas.height / Math.max(window.devicePixelRatio, 1),
        mapHeight: map.getBoundingClientRect().height,
      }
    })
  expect(mapSizes.canvasCssHeight).toBeLessThanOrEqual(Math.max(mapSizes.mapHeight, 512 * 5))
  const dprCanvasWidth = await page.evaluate(async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    window.dispatchEvent(new Event('resize'))
    await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(undefined)))
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.document-map-content')!
    return { backingWidth: canvas.width, cssWidth: canvas.clientWidth }
  })
  expect(dprCanvasWidth.backingWidth).toBe(Math.ceil(dprCanvasWidth.cssWidth * 2))

  await page.evaluate(() => {
    const target = window as typeof window & {
      __foldenInputDurations: number[]
      __foldenLongTasks: { duration: number; startTime: number }[]
    }
    target.__foldenInputDurations = []
    ;(
      window as typeof window & { __foldenLongTasks: { duration: number; startTime: number }[] }
    ).__foldenLongTasks = []
    window.addEventListener(
      'beforeinput',
      () => {
        const started = performance.now()
        queueMicrotask(() => target.__foldenInputDurations.push(performance.now() - started))
      },
      true,
    )
    new PerformanceObserver((list) => {
      target.__foldenLongTasks.push(
        ...list.getEntries().map((entry) => ({
          duration: entry.duration,
          startTime: entry.startTime,
        })),
      )
    }).observe({ type: 'longtask', buffered: false })
  })
  const wordCount = () =>
    page
      .locator('.statusbar span')
      .filter({ hasText: /words$/ })
      .textContent()
  await sourceEditor(page).click()
  await page.keyboard.press('Control+End')
  let previousWordCount = await wordCount()
  await page.keyboard.type(' warmup')
  await expect.poll(wordCount, { timeout: 1_000 }).not.toBe(previousWordCount)
  await page.evaluate(() => {
    const target = window as typeof window & {
      __foldenInputDurations: number[]
      __foldenLongTasks: { duration: number; startTime: number }[]
    }
    target.__foldenInputDurations = []
    target.__foldenLongTasks = []
  })
  previousWordCount = await wordCount()
  const analysisRunsMs: number[] = []
  for (let run = 0; run < 3; run += 1) {
    const started = await page.evaluate(() => performance.now())
    await page.keyboard.type(` sample${run}`)
    await expect.poll(wordCount, { timeout: 1_000 }).not.toBe(previousWordCount)
    previousWordCount = await wordCount()
    analysisRunsMs.push((await page.evaluate(() => performance.now())) - started)
  }
  const metrics = await page.evaluate(() => {
    const target = window as typeof window & {
      __foldenInputDurations: number[]
      __foldenLongTasks: { duration: number; startTime: number }[]
    }
    return {
      inputDurationsMs: target.__foldenInputDurations,
      longTasks: target.__foldenLongTasks,
    }
  })
  const inputP95Ms = percentile(metrics.inputDurationsMs, 0.95)
  const analysisMedianMs = median(analysisRunsMs)
  expect(inputP95Ms).toBeLessThanOrEqual(16)
  expect(analysisMedianMs).toBeLessThanOrEqual(1_000)
  expect(metrics.longTasks.filter(({ duration }) => duration >= 50)).toEqual([])
  writePerformanceReport('browser-document.json', {
    inputDurationsMs: metrics.inputDurationsMs,
    inputP95Ms,
    analysisRunsMs,
    analysisMedianMs,
  })
})

test('a 1k-entry directory renders inside the expansion budget', async ({ page }) => {
  const files = Object.fromEntries(
    ['warmup', 'large-0', 'large-1', 'large-2'].flatMap((directory) =>
      Array.from({ length: 1_000 }, (_, index) => [`${directory}/file-${index}.md`, 'text']),
    ),
  )
  await openApp(page, { mockOptions: { initialFiles: files } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-warmup').click()
  await expect(page.getByTestId('workspace-entry-warmup\\file-999.md')).toBeVisible()
  const directoryRunsMs: number[] = []
  for (let run = 0; run < 3; run += 1) {
    const directory = `large-${run}`
    const started = await page.evaluate((testId) => {
      const target = window as typeof window & { __foldenFirstWorkspaceRender?: number }
      delete target.__foldenFirstWorkspaceRender
      const observer = new MutationObserver(() => {
        if (document.querySelector(`[data-testid="${CSS.escape(testId)}"]`)) {
          target.__foldenFirstWorkspaceRender = performance.now()
          observer.disconnect()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      return performance.now()
    }, `workspace-entry-${directory}\\file-0.md`)
    await page.getByTestId(`workspace-entry-${directory}`).click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __foldenFirstWorkspaceRender?: number })
              .__foldenFirstWorkspaceRender,
        ),
      )
      .not.toBeUndefined()
    const firstRender = await page.evaluate(
      () =>
        (window as typeof window & { __foldenFirstWorkspaceRender: number })
          .__foldenFirstWorkspaceRender,
    )
    directoryRunsMs.push(firstRender - started)
    await expect(page.getByTestId(`workspace-entry-${directory}\\file-999.md`)).toBeVisible()
  }
  const directoryMedianMs = median(directoryRunsMs)
  expect(directoryMedianMs).toBeLessThanOrEqual(500)
  writePerformanceReport('browser-workspace.json', { directoryRunsMs, directoryMedianMs })
})
