import { expect, test } from '@playwright/test'
import { applicationLayoutStorageKey, openApp } from './helpers'

const longMarkdown = [
  '# Start',
  '',
  '###### Long heading that should stay clipped inside the outline navigation without horizontal scrolling',
  '',
  ...Array.from({ length: 36 }, (_, index) => `Paragraph ${index + 1}. Enough text for scrolling.`),
  '## Deep Target',
  '',
  ...Array.from({ length: 36 }, (_, index) => `- Item ${index + 1}`),
  '### Last Stop',
  '',
  ...Array.from({ length: 24 }, (_, index) => `Tail ${index + 1}.`),
].join('\n')

const veryLongMarkdown = [
  '# Long map',
  '',
  ...Array.from({ length: 260 }, (_, index) => `Line ${index + 1}.`),
].join('\n')

async function openWorkspace(page: Parameters<typeof openApp>[0]) {
  await page.getByTestId('open-folder-empty').click()
  await expect(page.getByRole('heading', { name: 'FoldenE2E' })).toBeVisible()
}

test('shows unique labels for duplicate Scenario tabs and Open Editors rows', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'folder 1/Scenario.md': '# One\n',
        'folder 2/Scenario.md': '# Two\n',
      },
    },
  })
  await openWorkspace(page)

  await page.getByTestId('workspace-entry-folder 1').click()
  await page.getByTestId('workspace-entry-folder 1\\Scenario.md').click()
  await page.getByTestId('workspace-entry-folder 2').click()
  await page.getByTestId('workspace-entry-folder 2\\Scenario.md').click()

  await expect(
    page.locator('.tab-button').filter({ hasText: 'folder 1/Scenario.md' }),
  ).toBeVisible()
  await expect(
    page.locator('.tab-button').filter({ hasText: 'folder 2/Scenario.md' }),
  ).toBeVisible()
  await expect(
    page.locator('.open-editor-row').filter({ hasText: 'folder 1/Scenario.md' }),
  ).toBeVisible()
  await expect(
    page.locator('.open-editor-row').filter({ hasText: 'folder 2/Scenario.md' }),
  ).toBeVisible()
  await expect(page.getByTestId('document-title')).toHaveText('Scenario.md')
})

test('hides workspace paths through settings without closing open documents', async ({ page }) => {
  await openApp(page)
  await openWorkspace(page)

  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()
  await expect(page.getByTestId('document-title')).toHaveText('daily.md')

  const row = page.getByTestId('workspace-entry-notes\\daily.md')
  await row.hover()
  await row.getByRole('button', { name: 'Hide from workspace' }).click({ force: true })

  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { getWorkspaceSettings: () => { ignoredPaths: string[] } }
          }
        ).__FOLDEN_TAURI_MOCK__?.getWorkspaceSettings(),
      ),
    )
    .toEqual({ ignoredPaths: ['notes\\daily.md'] })
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toHaveCount(0)
  await expect(page.getByTestId('document-title')).toHaveText('daily.md')

  await page.getByRole('button', { name: 'Open folder' }).click()
  await page.getByTestId('workspace-entry-notes').click()
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toHaveCount(0)
})

test('mutes folders without supported descendants and keeps action names in compact mode', async ({
  page,
}) => {
  await openApp(page, {
    mockOptions: {
      unsupportedFiles: ['media/photo.png'],
      initialFiles: {
        'docs/nested/readme.md': '# Supported\n',
      },
    },
  })
  await openWorkspace(page)

  await expect(page.getByTestId('workspace-entry-media')).toHaveClass(/muted/)
  await expect(page.getByTestId('workspace-entry-media')).toHaveAttribute(
    'title',
    /No supported files/,
  )
  await expect(page.getByTestId('workspace-entry-docs')).not.toHaveClass(/muted/)

  const scratchButton = page.locator('.workspace-tree-actions button[title="New scratch document"]')
  await expect(scratchButton.locator('span')).toBeHidden()
  await expect(scratchButton).toHaveAttribute('aria-label', 'New scratch document')
})

test('outline navigates visual and source editors', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'outline.md': longMarkdown,
      },
    },
  })
  await openWorkspace(page)
  await page.getByTestId('workspace-entry-outline.md').click()

  const outline = page.getByRole('complementary', { name: 'Document outline' })
  await expect(outline).toBeVisible()
  await expect
    .poll(async () => outline.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  const startHeading = outline.getByRole('button', { name: 'Start' })
  await expect(startHeading).toHaveClass(/active/)
  await startHeading.focus()
  await page.keyboard.press('End')
  await expect(outline.getByRole('button', { name: 'Last Stop' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () =>
      page.locator('.visual-editor-scroll').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(100)
  await expect(outline.getByRole('button', { name: 'Last Stop' })).toHaveClass(/active/)
  await page.getByRole('button', { name: 'Deep Target' }).click()
  await expect
    .poll(async () =>
      page.locator('.visual-editor-scroll').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(100)

  await page.getByRole('button', { name: 'Outline', exact: true }).click()
  await expect(outline).toHaveCount(0)
  await page.getByRole('button', { name: 'Outline', exact: true }).click()
  await expect(outline).toBeVisible()

  await page.getByRole('button', { name: 'Source' }).click()
  await page.locator('.source-editor .cm-scroller').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.getByRole('button', { name: 'Last Stop' }).click()
  await expect
    .poll(async () =>
      page.locator('.source-editor .cm-scroller').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(100)
  await expect(outline.getByRole('button', { name: 'Deep Target' })).toHaveClass(/active/)
})

test('document map scrolls long markdown in visual and source modes', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'map.md': veryLongMarkdown,
      },
    },
  })
  await openWorkspace(page)
  await page.getByTestId('workspace-entry-map.md').click()

  const visualMap = page.getByRole('complementary', { name: 'Document map' })
  await expect(visualMap).toBeVisible()
  await expect(visualMap.locator('.document-map-viewport')).toBeVisible()
  await page.locator('.visual-editor-scroll').evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.05
    element.dispatchEvent(new Event('scroll'))
  })
  await expect
    .poll(async () =>
      visualMap.locator('.document-map-content').evaluate((element) => {
        const content = element.getBoundingClientRect()
        const map = element.parentElement!.getBoundingClientRect()
        return content.top < map.top + 7
      }),
    )
    .toBe(true)
  const visualMapBox = await visualMap.boundingBox()
  expect(visualMapBox).not.toBeNull()
  await page.mouse.click(
    visualMapBox!.x + visualMapBox!.width / 2,
    visualMapBox!.y + visualMapBox!.height - 8,
  )
  await expect
    .poll(async () =>
      page.locator('.visual-editor-scroll').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(100)
  await page.locator('.visual-editor-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect
    .poll(async () =>
      visualMap.locator('.document-map-viewport').evaluate((element) => {
        const map = element.parentElement!
        const viewport = element.getBoundingClientRect()
        const mapRect = map.getBoundingClientRect()
        return Math.abs(viewport.bottom - mapRect.bottom) <= 17
      }),
    )
    .toBe(true)
  await expect
    .poll(async () =>
      visualMap
        .locator('.document-map-content')
        .evaluate((element) => getComputedStyle(element).transform !== 'none'),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Document map' }).click()
  await expect(visualMap).toHaveCount(0)
  await page.getByRole('button', { name: 'Document map' }).click()
  await expect(visualMap).toBeVisible()

  await page.getByRole('button', { name: 'Source' }).click()
  const sourceMap = page.getByRole('complementary', { name: 'Document map' })
  await expect(sourceMap).toBeVisible()
  await expect(sourceMap.locator('.document-map-viewport')).toBeVisible()
  await page.locator('.source-editor .cm-scroller').evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.05
    element.dispatchEvent(new Event('scroll'))
  })
  await expect
    .poll(async () =>
      sourceMap.locator('.document-map-content').evaluate((element) => {
        const content = element.getBoundingClientRect()
        const map = element.parentElement!.getBoundingClientRect()
        return content.top < map.top + 7
      }),
    )
    .toBe(true)
  const sourceMapBox = await sourceMap.boundingBox()
  expect(sourceMapBox).not.toBeNull()
  await page.mouse.move(sourceMapBox!.x + sourceMapBox!.width / 2, sourceMapBox!.y + 8)
  await page.mouse.down()
  await page.mouse.move(
    sourceMapBox!.x + sourceMapBox!.width / 2,
    sourceMapBox!.y + sourceMapBox!.height - 8,
    { steps: 8 },
  )
  await page.mouse.up()
  await expect
    .poll(async () =>
      page.locator('.source-editor .cm-scroller').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(100)

  await page.locator('.document-map-resize-handle').first().dispatchEvent('pointerdown', {
    pointerId: 1,
    clientX: sourceMapBox!.x,
    clientY: sourceMapBox!.y,
  })
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 0 })),
  )
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 })))
  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationLayoutStorageKey,
      ),
    )
    .toContain('"documentMapWidth"')
})

test('document map appears for short markdown in visual and source modes', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'short-map.md': '# Short map\n\nA short document.',
      },
    },
  })
  await openWorkspace(page)
  await page.getByTestId('workspace-entry-short-map.md').click()

  const documentMap = page.getByRole('complementary', { name: 'Document map' })
  await expect(documentMap).toBeVisible()
  await expect
    .poll(async () =>
      documentMap.evaluate((element) => element.clientHeight < element.parentElement!.clientHeight),
    )
    .toBe(true)
  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByRole('complementary', { name: 'Document map' })).toBeVisible()
})

test('plain text source documents do not show markdown outline or map', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'plain.txt': longMarkdown,
      },
    },
  })
  await openWorkspace(page)
  await page.getByTestId('workspace-entry-plain.txt').click()

  await expect(page.getByTestId('source-editor')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Document outline' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Document map' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Outline', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Document map' })).toBeDisabled()
})
