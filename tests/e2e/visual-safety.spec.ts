import { expect, test } from '@playwright/test'
import { openApp, sourceEditor } from './helpers'

test('keeps remote images blocked until the document explicitly allows them', async ({ page }) => {
  const remoteRequests: string[] = []

  await openApp(page)
  await page.route('https://example.com/**', async (route) => {
    remoteRequests.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pX6lz0AAAAASUVORK5CYII=',
        'base64',
      ),
    })
  })

  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\n![remote](https://example.com/preview.png)\n')

  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Remote image is blocked.')
  await expect(page.getByTestId('load-remote-images')).toBeVisible()
  await expect(page.locator('.topbar-title').getByTestId('load-remote-images')).toBeVisible()
  await expect(page.locator('.shared-toolbar').getByTestId('load-remote-images')).toHaveCount(0)

  await page.waitForTimeout(300)
  expect(remoteRequests).toEqual([])

  await page.getByTestId('load-remote-images').click()
  await expect.poll(() => remoteRequests.length).toBeGreaterThan(0)
  await expect(page.locator('img[src="https://example.com/preview.png"]')).toBeVisible()
})

test('opens visual links with Ctrl click without hijacking normal editing clicks', async ({
  page,
}) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.insertText(
    [
      '',
      '[Jump](#target-heading)',
      '',
      ...Array.from({ length: 24 }, (_, index) => `filler line ${index + 1}`),
      '',
      '## Target Heading',
      '',
      '[Example](https://example.com/docs)',
      '',
    ].join('\n'),
  )
  await page.evaluate(() => {
    Object.assign(window, {
      __FOLDEN_OPENED_LINK__: null,
      open: (url: string) => {
        Object.assign(window, { __FOLDEN_OPENED_LINK__: url })
        return null
      },
    })
  })

  await page.getByRole('button', { name: 'Visual' }).click()
  const scrollHost = page.locator('.visual-editor-scroll')
  await scrollHost.evaluate((node) => {
    node.scrollTop = 0
  })
  await page.locator('.visual-editor-content a[href="#target-heading"]').click()
  await expect.poll(async () => scrollHost.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)

  const link = page.locator('.visual-editor-content a[href="https://example.com/docs"]')
  await link.click()
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as Window & { __FOLDEN_OPENED_LINK__?: string | null }).__FOLDEN_OPENED_LINK__,
      ),
    )
    .toBe(null)

  await link.click({ modifiers: ['Control'] })
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as Window & { __FOLDEN_OPENED_LINK__?: string | null }).__FOLDEN_OPENED_LINK__,
      ),
    )
    .toBe('https://example.com/docs')
})
