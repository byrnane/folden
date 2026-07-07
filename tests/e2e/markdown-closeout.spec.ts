import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, sourceEditor } from './helpers'

const supportedKitchenSink = [
  '# Markdown Kitchen Sink',
  '',
  'Paragraph with **bold**, _italic_, ~~strike~~, and `code`.',
  '',
  '- one',
  '  - nested',
  '- three',
  '',
  '1. ordered',
  '2. list',
  '',
  '> quote',
  '',
  '```ts',
  'const answer = 42',
  '```',
  '',
  '[link](https://example.com)',
  '![image](./image.png)',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '- [x] Done',
  '- [ ] Todo',
  '',
  '---',
  '',
].join('\n')

test('shows markdown toolbar and visual mode for scratch markdown documents', async ({ page }) => {
  await openApp(page)

  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
  await expect(page.locator('.shared-toolbar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Visual' })).toBeEnabled()

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByRole('button', { name: 'Insert table' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Add row before' })).toBeDisabled()
  await sourceEditor(page).click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nscratch toolbar')
  await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Shift+ArrowLeft' : 'Control+Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Bold' }).click()

  await expect(page.getByTestId('source-editor')).toContainText('**toolbar**')
})

test('switches supported markdown kitchen sink without content or dirty changes', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'markdown_kitchen_sink.md': supportedKitchenSink,
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-markdown_kitchen_sink.md').click()

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole('button', { name: 'Source' }).click()
    await page.getByRole('button', { name: 'Visual' }).click()
  }

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
    }).__FOLDEN_TAURI_MOCK__?.readFile('markdown_kitchen_sink.md')
  ))).toBe(supportedKitchenSink)
  await expect(page.getByTestId('source-editor')).toContainText('Markdown Kitchen Sink')
})

test('keeps unsafe kitchen sink source-only when visual safety is cancelled', async ({ page }) => {
  const unsafeKitchenSink = readFileSync('test_files/markdown_kitchen_sink.md', 'utf8')

  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'markdown_kitchen_sink.md': unsafeKitchenSink,
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-markdown_kitchen_sink.md').click()

  await expect(page.getByTestId('source-editor')).toContainText('Markdown Kitchen Sink')
  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByRole('dialog', { name: 'Visual mode may rewrite markdown_kitchen_sink.md' })).toBeVisible()
  await page.getByRole('button', { name: 'Stay in Source' }).click()

  await expect(page.getByTestId('source-editor')).toContainText('Markdown Kitchen Sink')
  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
    }).__FOLDEN_TAURI_MOCK__?.readFile('markdown_kitchen_sink.md')
  ))).toBe(unsafeKitchenSink)
})

test('uses validated dialogs for source links and images', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nsource dialog')
  await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Shift+ArrowLeft' : 'Control+Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Link' }).click()

  await expect(page.getByRole('dialog', { name: 'Edit link' })).toBeVisible()
  await page.getByLabel('Link URL').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('javascript: links are not allowed.')).toBeVisible()
  await page.getByLabel('Link URL').fill('./notes.md')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('source [dialog](./notes.md)')

  await page.getByRole('button', { name: 'Link' }).click()
  await page.getByLabel('Link URL').fill('')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('source dialog')
  await expect(page.getByTestId('source-editor')).not.toContainText('source [dialog](./notes.md)')

  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.getByRole('button', { name: 'Image' }).click()
  await page.getByLabel('Image URL').fill('./diagram.png')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('![image](./diagram.png)')
})

test('edits visual table cells and task checkboxes without rewriting neighbors', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'visual_roundtrip.md': [
          '# Visual Round Trip',
          '',
          '| A | B |',
          '| --- | --- |',
          '| 1 | 2 |',
          '| keep | same |',
          '',
          '- [x] Done',
          '- [ ] Todo',
          '',
        ].join('\n'),
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-visual_roundtrip.md').click()

  await page.locator('.visual-editor-content td').first().click()
  await page.keyboard.type(' changed')
  await page.locator('.visual-editor-content input[type="checkbox"]').nth(1).click({ force: true })
  await page.getByRole('button', { name: 'Source' }).click()

  await expect(page.getByTestId('source-editor')).toContainText('1 changed')
  await expect(page.getByTestId('source-editor')).toContainText('| keep | same |')
  await expect(page.getByTestId('source-editor')).toContainText('- [x] Todo')
  await expect(page.getByTestId('source-editor')).toContainText('- [x] Done')
})
