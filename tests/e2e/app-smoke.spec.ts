import { expect, test } from '@playwright/test'
import { installTauriMock } from './tauriMock'

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.addInitScript(() => {
    window.localStorage.clear()
  })
  await page.goto('/')
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await installTauriMock(page)

  await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(resolve)))
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('opens a mocked workspace and saves an edited Markdown document', async ({ page }) => {
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByRole('heading', { name: 'FoldenE2E' })).toBeVisible()
  await expect(page.getByTestId('workspace-root')).toContainText('C:\\FoldenE2E')
  await expect(page.getByTestId('workspace-tree')).toContainText('README.md')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('.cache')

  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\README.md')

  await page.getByRole('button', { name: 'Source' }).click()
  const editor = page.getByTestId('source-editor').locator('.cm-content')
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nEdited by Playwright.\n')

  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')

  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Edited by Playwright.')

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Edited by Playwright.')

  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\README.md')
})

test('autosaves existing files but does not autosave scratch documents', async ({ page }) => {
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = page.getByTestId('source-editor').locator('.cm-content')
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nAutosaved change.\n')

  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')
  await expect(page.getByTestId('dirty-marker')).toHaveCount(0, { timeout: 5000 })

  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
    }).__FOLDEN_TAURI_MOCK__?.readFile('README.md')
  ))).toContain('Autosaved change.')

  await page.getByRole('button', { name: 'New scratch document' }).click()
  await page.getByRole('button', { name: 'Source' }).click()

  const scratchEditor = page.getByTestId('source-editor').locator('.cm-content')
  await scratchEditor.click()
  await page.keyboard.type('Scratch should stay dirty')

  await page.waitForTimeout(1600)
  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')
  await expect(page.getByTestId('status-path')).toContainText('Scratch')
})

test('asks before closing a dirty document tab', async ({ page }) => {
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = page.getByTestId('source-editor').locator('.cm-content')
  await editor.click()
  await page.keyboard.type('Dirty close check')

  await page.getByRole('button', { name: 'README.md' }).locator('.tab-close').click()
  await expect(page.getByRole('dialog', { name: 'Close README.md?' })).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Close README.md?' })).toHaveCount(0)
  await expect(page.getByTestId('document-title')).toHaveText('README.md')

  await page.getByRole('button', { name: 'README.md' }).locator('.tab-close').click()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
})

test('closes an unchanged visual document without dirty prompt', async ({ page }) => {
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)

  await page.getByRole('button', { name: 'README.md' }).locator('.tab-close').click()

  await expect(page.getByRole('dialog', { name: 'Close README.md?' })).toHaveCount(0)
  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)
  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
})
