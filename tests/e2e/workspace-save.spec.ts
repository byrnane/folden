import { expect, test } from '@playwright/test'
import { openApp, sourceEditor } from './helpers'

test('opens a mocked workspace and saves an edited Markdown document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByRole('heading', { name: 'FoldenE2E' })).toBeVisible()
  await expect(page.getByTestId('workspace-root')).toContainText('C:\\FoldenE2E')
  await expect(page.getByTestId('workspace-tree')).toContainText('README.md')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('.cache')

  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\README.md')

  await page.getByRole('button', { name: 'Source' }).click()
  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nEdited by Playwright.\n')

  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open · 1 unsaved')
  await expect(page.locator('.topbar')).not.toContainText('unsaved')

  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Edited by Playwright.')

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Edited by Playwright.')

  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\README.md')
})

test('switches visual and source without marking an unchanged document dirty', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')

  await page.getByRole('button', { name: 'Source' }).click()
  await page.getByRole('button', { name: 'Visual' }).click()
  await page.getByRole('button', { name: 'Source' }).click()
  await page.getByRole('button', { name: 'Visual' }).click()

  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await expect(page.getByRole('dialog', { name: /Close README\.md/ })).toHaveCount(0)
})

test('runs toolbar formatting commands in source mode', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.insertText('\nsource toolbar')
  for (let index = 0; index < 'toolbar'.length; index += 1) {
    await page.keyboard.press('Shift+ArrowLeft')
  }
  await page.getByRole('button', { name: 'Bold' }).click()

  await expect(page.getByTestId('source-editor')).toContainText('source **toolbar**')
})

test('closes the window after saving dirty documents from the close prompt', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nClose after save.\n')

  await page.evaluate(() =>
    (
      window as Window & {
        __FOLDEN_TAURI_MOCK__?: {
          requestWindowClose: () => Promise<void>
        }
      }
    ).__FOLDEN_TAURI_MOCK__?.requestWindowClose(),
  )

  await expect(page.getByRole('dialog', { name: 'Close Folden?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { isWindowDestroyed: () => boolean }
          }
        ).__FOLDEN_TAURI_MOCK__?.isWindowDestroyed(),
      ),
    )
    .toBe(false)

  await page.evaluate(() =>
    (
      window as Window & {
        __FOLDEN_TAURI_MOCK__?: {
          requestWindowClose: () => Promise<void>
        }
      }
    ).__FOLDEN_TAURI_MOCK__?.requestWindowClose(),
  )
  await page.getByRole('button', { name: 'Save all' }).click()

  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { isWindowDestroyed: () => boolean }
          }
        ).__FOLDEN_TAURI_MOCK__?.isWindowDestroyed(),
      ),
    )
    .toBe(true)
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('README.md'),
      ),
    )
    .toContain('Close after save.')
})

test('keeps the visual editor mounted after saving an open visual document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nVisual save should not remount.\n')
  await page.getByRole('button', { name: 'Visual' }).click()

  await expect(page.getByTestId('visual-editor')).toContainText('Visual save should not remount.')
  const visualNode = await page.getByTestId('visual-editor').elementHandle()
  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved')
  expect(
    await page
      .getByTestId('visual-editor')
      .evaluate((node, previousNode) => node.isSameNode(previousNode as Node), visualNode),
  ).toBe(true)
})

test('expands workspace folders lazily and opens nested files', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByTestId('workspace-tree')).toContainText('notes')
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toHaveCount(0)

  const folder = page.getByTestId('workspace-entry-notes')
  await folder.click()
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toBeVisible()
  await folder.getByRole('button', { name: 'New file', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(folder.getByRole('button', { name: 'New folder', exact: true })).toBeFocused()

  const file = page.getByTestId('workspace-entry-notes\\daily.md')
  await file.click()
  await expect(page.getByTestId('document-title')).toHaveText('daily.md')
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\notes\\daily.md')
  const rename = file.getByRole('button', { name: 'Rename', exact: true })
  await rename.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(rename).toBeFocused()
})

test('keeps nested workspace files visible after saving edits', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()

  await page.getByRole('button', { name: 'Source' }).click()
  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nKeep me visible.\n')
  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved')
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toBeVisible()
  await expect(page.getByTestId('workspace-entry-notes')).toBeVisible()
})
