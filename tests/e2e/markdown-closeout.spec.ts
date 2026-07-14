import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { documentDragMimeType, openApp, sourceEditor } from './helpers'

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

test('keeps formatting contextual in Visual and available in Source', async ({ page }) => {
  await openApp(page)

  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
  await expect(page.locator('.shared-toolbar')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Visual', exact: true })).toBeEnabled()

  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.locator('.shared-toolbar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Insert table' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Add row before' })).toBeDisabled()
  await sourceEditor(page).click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nscratch toolbar')
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Alt+Shift+ArrowLeft' : 'Control+Shift+ArrowLeft',
  )
  await page.getByRole('button', { name: 'Bold' }).click()

  await expect(page.getByTestId('source-editor')).toContainText('**toolbar**')
})

test('switches supported markdown kitchen sink without content or dirty changes', async ({
  page,
}) => {
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
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await page.getByRole('button', { name: 'Visual', exact: true }).click()
  }

  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('markdown_kitchen_sink.md'),
      ),
    )
    .toBe(supportedKitchenSink)
  await expect(page.getByTestId('source-editor')).toContainText('Markdown Kitchen Sink')

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nSaved closeout line.\n')
  await page.getByTestId('save-document').click()
  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await page
    .locator('.pane-tabs .tab-button')
    .filter({ hasText: 'markdown_kitchen_sink.md' })
    .locator('.tab-close')
    .click({ force: true })
  await page.getByTestId('workspace-entry-markdown_kitchen_sink.md').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Saved closeout line.')
})

test('keeps kitchen sink and raw source blocks unchanged through Visual', async ({ page }) => {
  const unsafeKitchenSink = readFileSync('test_files/markdown_kitchen_sink.md', 'utf8')
  const rawSource = [
    '---',
    'title: Raw Source',
    '---',
    '',
    '<section data-folden="raw">Raw HTML</section>',
    '',
    '<!-- keep this comment -->',
    '',
    '# Body',
    '',
  ].join('\n')

  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'markdown_kitchen_sink.md': unsafeKitchenSink,
        'raw_source.md': rawSource,
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-markdown_kitchen_sink.md').click()

  await expect(page.getByTestId('visual-editor')).toContainText('Markdown Kitchen Sink')
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Source block')
  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('markdown_kitchen_sink.md'),
      ),
    )
    .toBe(unsafeKitchenSink)

  await page.getByTestId('workspace-entry-raw_source.md').click()
  await expect(page.locator('.raw-markdown-block')).toHaveCount(3)
  await page.getByTestId('save-document').click()
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('raw_source.md'),
      ),
    )
    .toBe(rawSource)
})

test('uses validated dialogs for source links and images', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Source', exact: true }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nsource dialog')
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Alt+Shift+ArrowLeft' : 'Control+Shift+ArrowLeft',
  )
  await page.getByRole('button', { name: 'Link' }).click()

  await expect(page.getByRole('dialog', { name: 'Edit link' })).toBeVisible()
  await page.getByLabel('Link URL').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('javascript: links are not allowed.')).toBeVisible()
  await page.getByLabel('Link URL').fill('./notes.md')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('source [dialog](./notes.md)')

  await page.getByRole('button', { name: 'Link' }).click()
  await page.getByLabel('Link URL').fill('./cancelled.md')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('source-editor')).not.toContainText('./cancelled.md')

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

test('keeps instant visual edits and view position when switching modes', async ({ page }) => {
  const longDocument = [
    '# Long Document',
    '',
    ...Array.from({ length: 140 }, (_, index) => `Paragraph ${index + 1}`),
    '',
  ].join('\n')

  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'long.md': longDocument,
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-long.md').click()

  const visualSurface = page.locator('.visual-editor-content .ProseMirror')
  await visualSurface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type(' instant visual edit')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('instant visual edit')

  const sourceScroller = page.getByTestId('source-editor').locator('.cm-scroller')
  await sourceScroller.evaluate((node) => {
    node.scrollTop = 900
  })
  const beforeSwitchScroll = await sourceScroller.evaluate((node) => node.scrollTop)
  expect(beforeSwitchScroll).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect
    .poll(async () => sourceScroller.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100)
})

test('edits visual tables and task checkboxes without rewriting neighbors', async ({ page }) => {
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

  await expect(page.getByRole('button', { name: 'Add row before' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete table' })).toHaveCount(0)
  await page.locator('.visual-editor-content td').first().click()
  await expect(page.getByRole('button', { name: 'Add row before' })).toBeEnabled()
  await page.getByRole('button', { name: 'Add row after' }).click()
  await page.getByRole('button', { name: 'Add column after' }).click()
  await page.locator('.visual-editor-content td').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' changed')
  await page.locator('.visual-editor-content input[type="checkbox"]').nth(1).click({ force: true })
  await page.getByRole('button', { name: 'Source', exact: true }).click()

  await expect(page.getByTestId('source-editor')).toContainText(/1\s*changed/u)
  await expect(page.getByTestId('source-editor')).toContainText('keep')
  await expect(page.getByTestId('source-editor')).toContainText('same')
  await expect(page.getByTestId('source-editor')).toContainText('- [x] Todo')
  await expect(page.getByTestId('source-editor')).toContainText('- [x] Done')

  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await page.locator('.visual-editor-content td').first().click()
  await expect(page.getByRole('button', { name: 'Delete table' })).toBeEnabled()
  await page.getByRole('button', { name: 'Delete table' }).click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).not.toContainText('| A')
  await expect(page.getByTestId('source-editor')).toContainText('- [x] Todo')
})

test('opens workspace and external drag payloads in editor drop zones', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'external.md': '# External file\n',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()

  await page
    .locator('.editor-pane')
    .first()
    .evaluate((target, mimeType) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData(
        mimeType,
        JSON.stringify({
          kind: 'workspace-file',
          path: 'README.md',
          label: 'README.md',
        }),
      )
      target.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )
    }, documentDragMimeType)
  await expect(page.getByTestId('document-title')).toHaveText('README.md')

  await page.locator('.right-split-drop-zone').evaluate((target, mimeType) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData(
      mimeType,
      JSON.stringify({
        kind: 'external-path',
        path: 'external.md',
        label: 'external.md',
      }),
    )
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    )
  }, documentDragMimeType)
  await expect(page.locator('.editor-pane')).toHaveCount(2)
  await expect(page.getByTestId('document-title')).toHaveText('external.md')
})
