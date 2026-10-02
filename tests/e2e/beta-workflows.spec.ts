import { expect, test } from '@playwright/test'
import { applicationSettingsStorageKey, openApp, sourceEditor } from './helpers'
import { defaultApplicationSettings } from '../../src/application/settings/defaults'

test('creates a game document, finds it, searches and prints its current text', async ({
  page,
}) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: 'Game design document', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Game project')
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByTestId('document-title')).toHaveText('Game project.md')
  await expect(page.getByTestId('visual-editor').locator('.tiptap')).toContainText('Core loop')
  await page.keyboard.press('Control+p')
  await page.getByRole('textbox', { name: 'File name or path' }).fill('Game project')
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Game project.md', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+Shift+f')
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Core loop')
  await expect(page.locator('.search-result').filter({ hasText: 'Game project.md' })).toBeVisible()
  await page.locator('.search-result').filter({ hasText: 'Game project.md' }).click()
  await expect(page.getByTestId('source-editor')).toBeVisible()
  await page.evaluate(() => {
    window.print = () => {
      ;(window as typeof window & { printed: string }).printed =
        document.querySelector('.folden-print-view')?.textContent ?? ''
    }
  })
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { printed: string }).printed))
    .toContain('Core loop')
  await page.emulateMedia({ media: 'print' })
  await page.addStyleTag({ content: 'body { min-height: 100vh; height: 100vh; }' })
  await expect(page.locator('body')).toHaveCSS('min-height', '0px')
  const printedHeading = page.locator('.folden-print-view h1')
  await expect(printedHeading).toHaveCSS('color', 'rgb(17, 17, 17)')
  expect(
    await printedHeading.evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize)),
  ).toBeCloseTo((22 * 96) / 72, 2)
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1)
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: null })
})

test('follows relative document links and navigates back', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'one.md': '# One\n\n[Two](two.md#section)',
        'two.md': '# Section\n\nSecond document',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-one.md').click()
  await page
    .getByTestId('visual-editor')
    .locator('a')
    .click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('two.md')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByTestId('document-title')).toHaveText('one.md')
})

test('opens a relative anchor in Source before background headings arrive', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
        setTimeout(() => {
          if (Array.isArray(options)) super.postMessage(message, options)
          else super.postMessage(message, options)
        }, 5000)
      }
    }
  })
  await openApp(page, {
    storageEntries: {
      [applicationSettingsStorageKey]: JSON.stringify({
        ...defaultApplicationSettings,
        language: 'en',
        editor: { ...defaultApplicationSettings.editor, defaultMarkdownMode: 'source' },
      }),
    },
    mockOptions: {
      initialFiles: {
        'one.md': '# One\n\n[Section](two.md#section)',
        'two.md': `# Beginning\n\n${'A paragraph before the linked section.\n\n'.repeat(60)}# Section\n\nTarget`,
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-one.md').click()
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await page.locator('.visual-editor-content a').click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('two.md')
  await expect(sourceEditor(page).locator('.cm-activeLine')).toHaveText('# Section')
  await expect(sourceEditor(page).locator('.cm-activeLine')).toBeInViewport()
})

test('retains a document’s chosen Source mode when following a relative link', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'one.md': '# One\n\n[Section](two.md#section)',
        'two.md': '# Section\n\nTarget',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-two.md').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(sourceEditor(page)).toBeVisible()
  await page.getByTestId('workspace-entry-one.md').click()
  await page.locator('.visual-editor-content a').click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('two.md')
  await expect(sourceEditor(page)).toBeVisible()
  await expect(sourceEditor(page).locator('.cm-activeLine')).toHaveText('# Section')
})

test('opens a relative link to a duplicate heading in Visual', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'one.md': '# One\n\n[Second section](two.md#section-1)',
        'two.md': `# Section\n\n${'A paragraph before the duplicate heading.\n\n'.repeat(30)}# Section\n\nTarget`,
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-one.md').click()
  await page.locator('.visual-editor-content a').click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('two.md')
  const headings = page.locator('.visual-editor-content .ProseMirror h1')
  await expect(headings.nth(1)).toBeInViewport()
  await expect(headings.first()).not.toBeInViewport()
})

test('switches the interface language without rewriting a document', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'video.md': '# Video\n\nUnchanged text' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-video.md').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByTestId('language-select').selectOption('ru')
  await expect(page.getByRole('button', { name: 'Проект', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Проект', exact: true }).click()
  await expect(page.getByTestId('visual-editor').locator('.tiptap')).toContainText('Unchanged text')
  await expect(page.getByRole('button', { name: 'Печать / PDF' })).toBeVisible()
})

test('prints plain text literally and includes unsaved source edits', async ({ page }) => {
  const original = '# literal <tag>\n\n**not bold**\n- raw list\n'
  await openApp(page, { mockOptions: { initialFiles: { 'plain.txt': original } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-plain.txt').click()
  const source = page.getByTestId('source-editor').locator('.cm-content')
  await source.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('unsaved text')
  await page.evaluate(() => {
    window.print = () => {
      const target = window as typeof window & { printed: string; printedHtml: string }
      target.printed = document.querySelector('.folden-print-view')?.textContent ?? ''
      target.printedHtml = document.querySelector('.folden-print-view')?.innerHTML ?? ''
      window.dispatchEvent(new Event('afterprint'))
    }
  })
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { printed: string }).printed))
    .toBe(`${original}unsaved text`)
  expect(
    await page.evaluate(() => (window as typeof window & { printedHtml: string }).printedHtml),
  ).toContain('&lt;tag&gt;')
  await expect(page.locator('.folden-print-view')).toHaveCount(0)
})

test('returns to the actual link origin after switching documents manually', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'one.md': '[Two](two.md)',
        'two.md': 'Two',
        'three.md': '[Four](four.md)',
        'four.md': 'Four',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-one.md').click()
  await page
    .getByTestId('visual-editor')
    .locator('a')
    .click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('two.md')
  await page.getByTestId('workspace-entry-three.md').click()
  await page
    .getByTestId('visual-editor')
    .locator('a')
    .click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('four.md')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByTestId('document-title')).toHaveText('three.md')
})

test('keeps keyboard-selected quick-open results visible', async ({ page }) => {
  const initialFiles = Object.fromEntries(
    Array.from({ length: 35 }, (_, index) => [
      `quick-${String(index).padStart(2, '0')}.md`,
      `# Document ${index}`,
    ]),
  )
  await openApp(page, { mockOptions: { initialFiles } })
  await page.getByTestId('open-folder-empty').click()
  await page.keyboard.press('Control+p')
  const input = page.getByRole('textbox', { name: 'File name or path' })
  await input.fill('quick-')
  for (let index = 0; index < 34; index += 1) await input.press('ArrowDown')
  const last = page.getByRole('dialog').getByRole('button', { name: 'quick-34.md', exact: true })
  await expect(last).toHaveClass(/active/)
  expect(
    await last.evaluate((element) => {
      const item = element.getBoundingClientRect(),
        list = element.parentElement!.getBoundingClientRect()
      return item.top >= list.top && item.bottom <= list.bottom
    }),
  ).toBe(true)
  await input.press('Enter')
  await expect(page.getByTestId('document-title')).toHaveText('quick-34.md')
})

test('keeps a video project usable through image import, links, move and restart', async ({
  page,
}, testInfo) => {
  await openApp(page, { mockOptions: { persistAcrossReload: true } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: 'Video script', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Launch video')
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.locator('.visual-editor-content')).toContainText('Introduction')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await sourceEditor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(
    'Recorded introduction and a clear ending.\n\n[Daily note](notes/daily.md)\n\n',
  )
  await page.getByRole('button', { name: 'Image', exact: true }).click()
  await expect(sourceEditor(page)).toContainText('(Launch%20video.assets/picture.png)')
  await page.getByTestId('save-document').click()
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await expect(page.locator('.visual-image-node img')).toHaveJSProperty('naturalWidth', 1)
  await expect(page.locator('.visual-image-node img')).toHaveAttribute(
    'src',
    `http://asset.localhost/${encodeURIComponent('C:\\FoldenE2E\\Launch video.assets\\picture.png')}`,
  )
  await page
    .getByRole('link', { name: 'Daily note', exact: true })
    .click({ modifiers: ['Control'] })
  await expect(page.getByTestId('document-title')).toHaveText('daily.md')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  const row = page.getByTestId('workspace-entry-Launch video.md')
  await row.hover()
  await row.getByRole('button', { name: 'Move', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('notes')
  await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Relative links and images may need updating',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByTestId('document-title')).toHaveText('Launch video.md')
  await expect(page.locator('.visual-image-node img')).toHaveAttribute(
    'src',
    `http://asset.localhost/${encodeURIComponent('C:\\FoldenE2E\\notes\\Launch video.assets\\picture.png')}`,
  )
  await expect(page.locator('.visual-image-node img')).toHaveJSProperty('naturalWidth', 1)
  await page.locator('.visual-editor-content .ProseMirror p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/image')
  await page
    .getByTestId('visual-slash-menu')
    .getByRole('button', { name: 'Image', exact: true })
    .click()
  await expect(page.locator('.visual-image-node img')).toHaveCount(2)
  const secondImage = page.locator(
    '.visual-image-node[data-image-source="Launch%20video.assets/picture-2.png"] img',
  )
  await expect(secondImage).toHaveAttribute(
    'src',
    `http://asset.localhost/${encodeURIComponent('C:\\FoldenE2E\\notes\\Launch video.assets\\picture-2.png')}`,
  )
  await expect(secondImage).toHaveJSProperty('naturalWidth', 1)
  await page.getByTestId('save-document').click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(sessionStorage.getItem('folden-e2e-native') ?? '{}') as {
          session?: { documents?: { relativePath?: string }[] }
        }
        return state.session?.documents?.some(
          (document) => document.relativePath === 'notes\\Launch video.md',
        )
      }),
    )
    .toBe(true)
  await page.reload()
  await expect(page.getByTestId('document-title')).toHaveText('Launch video.md')
  await expect(page.locator('.visual-editor-content')).toContainText('Recorded introduction')
  await expect(page.locator('.visual-image-node img')).toHaveCount(2)
  await expect(page.locator('.visual-image-node img').first()).toHaveJSProperty('naturalWidth', 1)
  await expect(page.locator('.visual-image-node img').last()).toHaveJSProperty('naturalWidth', 1)
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await sourceEditor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nUpdated ending before recording.\n')
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await page.evaluate(() => {
    window.print = () => {
      ;(window as typeof window & { printed: string }).printed =
        document.querySelector('.folden-print-view')?.textContent ?? ''
      window.dispatchEvent(new Event('afterprint'))
    }
  })
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { printed: string }).printed))
    .toContain('Updated ending before recording.')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(sessionStorage.getItem('folden-e2e-native') ?? '{}') as {
          recovery?: { content: string }[]
        }
        return state.recovery?.some((entry) =>
          entry.content.includes('Updated ending before recording.'),
        )
      }),
    )
    .toBe(true)
  await expect(page.getByRole('alert')).toHaveCount(0)
  for (const locale of ['en', 'ru'] as const) {
    if (locale === 'ru') {
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('button', { name: 'Appearance', exact: true }).click()
      await page.getByTestId('language-select').selectOption(locale)
      await page.getByRole('button', { name: 'Проект', exact: true }).click()
    }
    for (const width of [1500, 900]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: testInfo.outputPath(`video-dark-${locale}-${width}.png`),
        animations: 'disabled',
        caret: 'hide',
      })
    }
  }
})
