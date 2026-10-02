import { expect, test } from '@playwright/test'
import { openApp, sourceEditor } from './helpers'

for (const mode of ['Visual', 'Source'] as const) {
  test(`finds and replaces literal text in ${mode} without losing input focus`, async ({
    page,
  }) => {
    await openApp(page, {
      mockOptions: { initialFiles: { 'find.md': '# Search\n\nBody **body** BODY.\n' } },
    })
    await page.getByTestId('open-folder-empty').click()
    await page.getByTestId('workspace-entry-find.md').click()
    if (mode === 'Source') {
      await page.getByRole('button', { name: 'Source', exact: true }).click()
      await expect(sourceEditor(page)).toBeVisible()
    }
    await page.keyboard.press('Control+h')
    const panel = page.locator('.find-panel')
    const query = panel.getByRole('textbox', { name: 'Find', exact: true })
    await query.pressSequentially('body')
    await expect(query).toBeFocused()
    await expect(panel).toContainText('1 / 3')
    await expect(page.locator('.editor-search-match')).toHaveCount(3)
    await query.fill('')
    await expect(page.locator('.editor-search-match')).toHaveCount(0)
    await query.fill('body')
    await expect(page.locator('.editor-search-match')).toHaveCount(3)
    await panel.getByRole('textbox', { name: 'Replace', exact: true }).fill('Scene')
    await panel.getByRole('button', { name: 'Replace all', exact: true }).click()
    await expect(panel).toContainText('No matches')
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    const surface =
      mode === 'Source' ? sourceEditor(page) : page.locator('.visual-editor-content .ProseMirror')
    await expect(surface).toContainText(
      mode === 'Source' ? 'Scene **Scene** Scene.' : 'Scene Scene Scene.',
    )
    await surface.click()
    await page.keyboard.press('Control+z')
    await expect(surface).toContainText(
      mode === 'Source' ? 'Body **body** BODY.' : 'Body body BODY.',
    )
  })

  test(`imports pasted and dropped image bytes in ${mode} as portable Markdown`, async ({
    page,
  }) => {
    await openApp(page, { mockOptions: { initialFiles: { 'images.md': '# Images\n\nBody\n' } } })
    await page.getByTestId('open-folder-empty').click()
    await page.getByTestId('workspace-entry-images.md').click()
    if (mode === 'Source') await page.getByRole('button', { name: 'Source', exact: true }).click()
    const surface =
      mode === 'Source' ? sourceEditor(page) : page.locator('.visual-editor-content .ProseMirror')
    await surface.click()
    await page.keyboard.press('Control+End')
    for (const eventName of ['paste', 'drop'] as const) {
      await surface.evaluate((element, name) => {
        const transfer = new DataTransfer()
        transfer.items.add(
          new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'shot.png', {
            type: 'image/png',
          }),
        )
        const event =
          name === 'paste'
            ? new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: transfer,
              })
            : new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
        element.dispatchEvent(event)
      }, eventName)
      const imageUrl = eventName === 'paste' ? 'images.assets/shot.png' : 'images.assets/shot-2.png'
      if (mode === 'Source') await expect(sourceEditor(page)).toContainText(`(${imageUrl})`)
      else
        await expect(page.locator('.visual-image-node').last()).toHaveAttribute(
          'data-image-source',
          imageUrl,
        )
      await page.getByTestId('save-document').click()
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as Window & {
                __FOLDEN_TAURI_MOCK__?: { readFile(path: string): string | null }
              }
            ).__FOLDEN_TAURI_MOCK__?.readFile('images.md'),
          ),
        )
        .toContain(`(${imageUrl})`)
    }
    await expect(page.locator('.pane-grid')).not.toHaveClass(/drag-active/)
  })
}

test('replaces text inside raw source blocks without rewriting neighboring Markdown', async ({
  page,
}) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'raw-find.md': '*Keep*\n\n<!-- secret secret -->\n\nTail\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-raw-find.md').click()
  await page.keyboard.press('Control+h')
  const panel = page.locator('.find-panel')
  await panel.getByRole('textbox', { name: 'Find', exact: true }).fill('secret')
  await expect(panel).toContainText('1 / 2')
  await panel.getByRole('textbox', { name: 'Replace', exact: true }).fill('public')
  await panel.getByRole('button', { name: 'Replace all', exact: true }).click()
  await page.getByTestId('save-document').click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __FOLDEN_TAURI_MOCK__?: { readFile(path: string): string | null } }
        ).__FOLDEN_TAURI_MOCK__?.readFile('raw-find.md'),
      ),
    )
    .toBe('*Keep*\n\n<!-- public public -->\n\nTail\n')
})

test('updates reference links through replace while retaining raw neighboring blocks', async ({
  page,
}) => {
  const source = '<!-- keep -->\n\n[Docs][ref]\n\n[ref]: old.md\n\nTail\n'
  await openApp(page, { mockOptions: { initialFiles: { 'references.md': source } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-references.md').click()
  await page.keyboard.press('Control+h')
  const panel = page.locator('.find-panel')
  await panel.getByRole('textbox', { name: 'Find', exact: true }).fill('old.md')
  await panel.getByRole('textbox', { name: 'Replace', exact: true }).fill('new.md')
  await panel.getByRole('button', { name: 'Replace all', exact: true }).click()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Docs', exact: true })).toHaveAttribute(
    'href',
    'new.md',
  )
  await expect(page.locator('.raw-markdown-block')).toHaveCount(2)
  await page
    .locator('.visual-editor-content p')
    .filter({ hasText: /^Tail$/ })
    .click()
  await page.keyboard.press('End')
  await page.keyboard.type(' changed')
  await page.getByTestId('save-document').click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __FOLDEN_TAURI_MOCK__?: { readFile(path: string): string | null } }
        ).__FOLDEN_TAURI_MOCK__?.readFile('references.md'),
      ),
    )
    .toBe(source.replace('old.md', 'new.md').replace('Tail', 'Tail changed'))
})
