import { expect, type Locator, type Page, test } from '@playwright/test'
import { applicationSettingsStorageKey, openApp } from './helpers'

for (const [name, prefix] of [
  ['nested list', '- first\n  - nested\n- final\n\n'],
  ['continued list', '- first\n\n  continuation\n- final\n\n'],
  ['reference definitions', '[link][ref]\n\n[ref]: https://example.com\n\n'],
  ['blank separators', '# Heading\n\n\n\nParagraph\n\n\n\n'],
] as const) {
  test(`preserves ${name} when editing a neighboring Visual paragraph`, async ({ page }) => {
    const source = `${prefix}Tail\n`
    await openApp(page, { mockOptions: { initialFiles: { 'boundaries.md': source } } })
    await page.getByTestId('open-folder-empty').click()
    await page.getByTestId('workspace-entry-boundaries.md').click()
    const surface = page.locator('.visual-editor-content .ProseMirror')
    await surface
      .locator('p')
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
          ).__FOLDEN_TAURI_MOCK__?.readFile('boundaries.md'),
        ),
      )
      .toBe(`${prefix}Tail changed\n`)
    if (name === 'reference definitions') {
      await expect(surface.getByRole('link', { name: 'link', exact: true })).toHaveAttribute(
        'href',
        'https://example.com',
      )
    }
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('source-editor')).not.toContainText('Tail changed')
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('source-editor')).toContainText('Tail changed')
  })
}

function blockHandle(surface: Locator, index: number) {
  return surface.locator('.visual-block-controls').nth(index).getByTestId('visual-block-handle')
}

test('keeps mixed text and images lossless while editing Enter in Visual source blocks', async ({
  page,
}) => {
  const source = '# Heading\n\nOriginal content.\n![image](./image.png)\n\nTail\n'
  await openApp(page, { mockOptions: { initialFiles: { 'inline-image.md': source } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-inline-image.md').click()
  const raw = page.locator('.raw-markdown-block')
  await expect(raw).toHaveCount(1)
  await raw.getByRole('button', { name: /Source block/ }).click()
  const field = raw.getByLabel('Edit raw Markdown block')
  await expect(field).toHaveValue('Original content.\n![image](./image.png)\n\n')
  await field.evaluate((element) => (element as HTMLTextAreaElement).setSelectionRange(8, 8))
  await field.press('Enter')
  await field.blur()
  const expected = source.replace('Original content.', 'Original\n content.')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Original\n content.')
  await expect(page.getByTestId('source-editor')).toContainText('![image](./image.png)')
  await page.getByTestId('save-document').click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __FOLDEN_TAURI_MOCK__?: { readFile(path: string): string | null } }
        ).__FOLDEN_TAURI_MOCK__?.readFile('inline-image.md'),
      ),
    )
    .toBe(expected)
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await expect(page.locator('.visual-editor-content .ProseMirror p').last()).toHaveText('Tail')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

function blockMenuTrigger(surface: Locator, index: number) {
  return surface
    .locator('.visual-block-controls')
    .nth(index)
    .getByTestId('visual-block-menu-trigger')
}

const contextToolbarMarkdown = `Plain text

[Example](https://example.com)

![Picture](missing.png)

| One | Two |
| --- | --- |
| A | B |
`

async function expectContextToolbar(
  page: Page,
  context: 'text' | 'link' | 'image' | 'table',
  firstAction: string,
  labelsVisible: boolean,
) {
  const toolbar = page.getByTestId('visual-context-menu')
  await expect(toolbar).toHaveAttribute('data-context', context)
  const firstButton = toolbar.getByRole('button', { name: firstAction })
  await expect(firstButton).toHaveAttribute('title', firstAction)
  if (labelsVisible) {
    await expect(firstButton.locator('span')).toBeVisible()
  } else {
    await expect(firstButton.locator('span')).toBeHidden()
  }

  if (!labelsVisible) {
    await expect
      .poll(async () => {
        const box = await firstButton.boundingBox()
        return box ? Math.abs(box.width - box.height) : Number.POSITIVE_INFINITY
      })
      .toBeLessThanOrEqual(1)
  }
}

for (const density of ['compact', 'comfortable'] as const) {
  test(`uses ${density} density across every contextual toolbar state`, async ({ page }) => {
    await openApp(page, {
      mockOptions: { initialFiles: { 'contexts.md': contextToolbarMarkdown } },
      storageEntries: {
        [applicationSettingsStorageKey]: JSON.stringify({ appearance: { density } }),
      },
    })
    await page.getByTestId('open-folder-empty').click()
    await page.getByTestId('workspace-entry-contexts.md').click()

    const surface = page.locator('.visual-editor-content .ProseMirror')
    const text = surface.locator('p').filter({ hasText: 'Plain text' })
    await text.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+ArrowLeft')
    await expectContextToolbar(page, 'text', 'Bold', density === 'comfortable')

    await surface.getByRole('link', { name: 'Example' }).click()
    await expectContextToolbar(page, 'link', 'Open link', density === 'comfortable')

    await surface.locator('.visual-image-node').click()
    await expectContextToolbar(page, 'image', 'Source', density === 'comfortable')

    await surface.locator('td').first().click()
    await expectContextToolbar(page, 'table', 'Add row before', density === 'comfortable')
  })
}

test('uses slash commands and contextual formatting without a permanent toolbar', async ({
  page,
}) => {
  await openApp(page)

  const surface = page.locator('.visual-editor-content .ProseMirror')
  await surface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('/head')
  await expect(page.getByTestId('visual-slash-menu')).toBeVisible()
  await page.getByTestId('visual-slash-menu').getByRole('button', { name: 'Heading 1' }).click()
  await page.keyboard.type('Visual document')

  await expect(surface.locator('h1')).toHaveText('Visual document')
  await expect(page.locator('.shared-toolbar')).toBeHidden()

  await page.keyboard.press('Shift+ArrowLeft')
  await expect(page.getByTestId('visual-context-menu')).toBeVisible()
  await page.getByTestId('visual-context-menu').getByRole('button', { name: 'Bold' }).click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('**t**')
})

test('renders italic formatting in visual mode', async ({ page }) => {
  await openApp(page, { mockOptions: { initialFiles: { 'italic.md': 'Italic text\n' } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-italic.md').click()

  const paragraph = page.locator('.visual-editor-content .ProseMirror > p')
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Control+ArrowLeft')
  await page.getByTestId('visual-context-menu').getByRole('button', { name: 'Italic' }).click()

  await expect(paragraph.locator('em')).toHaveText('text')
  await expect(paragraph.locator('em')).toHaveCSS('font-synthesis', 'style')
  await expect(paragraph.locator('em')).toHaveCSS('font-style', 'italic')
})

test('keeps Markdown markers hidden after sequential visual formatting', async ({ page }) => {
  await openApp(page, { mockOptions: { initialFiles: { 'marks.md': 'Unknown Space\n' } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-marks.md').click()

  const paragraph = page.locator('.visual-editor-content .ProseMirror > p')
  await paragraph.click()
  await page.keyboard.press('Home')
  for (let index = 0; index < 'Unknown'.length; index += 1) {
    await page.keyboard.press('Shift+ArrowRight')
  }
  await page.getByTestId('visual-context-menu').getByRole('button', { name: 'Italic' }).click()
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Control+ArrowLeft')
  await page.getByTestId('visual-context-menu').getByRole('button', { name: 'Strike' }).click()

  await expect(paragraph).toHaveText('Unknown Space')
  await expect(paragraph.locator('em')).toHaveText('Unknown')
  await expect(paragraph.locator('s')).toHaveText('Space')
})

test('does not render emphasis markers from existing Markdown', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'existing-marks.md': '*Unknown* ~~Space~~\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-existing-marks.md').click()

  const paragraph = page.locator('.visual-editor-content .ProseMirror > p')
  await expect(paragraph).toHaveText('Unknown Space')
  await expect(paragraph.locator('em')).toHaveText('Unknown')
  await expect(paragraph.locator('s')).toHaveText('Space')
})

test('selects, duplicates, transforms and moves blocks from the handle', async ({ page }) => {
  await openApp(page)

  const surface = page.locator('.visual-editor-content .ProseMirror')
  await surface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('First')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Third')

  await surface.locator('p').first().hover()
  await blockHandle(surface, 0).click()
  await expect(surface.locator('.visual-block-selected')).toHaveCount(1)
  await blockMenuTrigger(surface, 0).click()
  await page.getByTestId('visual-block-menu').getByRole('button', { name: 'Duplicate' }).click()
  await expect(surface).toContainText('First')
  await expect(surface.locator('p')).toHaveCount(4)

  await surface.locator('p').nth(1).hover()
  await blockHandle(surface, 1).click()
  await blockMenuTrigger(surface, 1).click()
  await page.getByTestId('visual-block-menu').getByText('Turn into').click()
  await page.getByTestId('visual-block-menu').getByRole('button', { name: 'Heading 2' }).click()
  await expect(surface.locator('h2')).toHaveText('First')
  await expect(surface).toBeFocused()

  await page.keyboard.press('Alt+ArrowDown')
  await expect(surface.locator(':scope > .visual-block-node').nth(2)).toHaveText('First')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(surface.locator('h2')).toHaveText('First')
})

test('extends block selection and drags the range as one operation', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'blocks.md': 'One\n\nTwo\n\nThree\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-blocks.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blocks = surface.locator(':scope > p')
  await blocks.nth(0).hover()
  await blockHandle(surface, 0).click()
  await blocks.nth(1).hover()
  await blockHandle(surface, 1).click({ modifiers: ['Shift'] })
  await expect(surface.locator('.visual-block-selected')).toHaveCount(2)

  await blocks.nth(1).hover()
  const handle = blockHandle(surface, 1)
  const handleBox = await handle.boundingBox()
  const targetBox = await blocks.nth(2).boundingBox()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox!.x + 20, targetBox!.y + targetBox!.height - 2, { steps: 8 })
  await page.mouse.up()

  await expect(surface.locator(':scope > p').first()).toHaveText('Three')
})

test('moves a block with pointer drag and keeps the drop cursor active', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'drag.md': 'One\n\nTwo\n\nThree\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-drag.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blocks = surface.locator(':scope > p')
  await blocks.first().hover()
  const handle = blockHandle(surface, 0)
  const handleBox = await handle.boundingBox()
  const targetBox = await blocks.nth(2).boundingBox()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox!.x + 20, targetBox!.y + 2, { steps: 8 })
  await page.mouse.up()

  await expect(blocks.nth(0)).toHaveText('Two')
  await expect(blocks.nth(1)).toHaveText('One')
  await expect(page.locator('.visual-editor-block-dragging')).toHaveCount(0)
  const movedBlockBox = await blocks.nth(1).boundingBox()
  const movedHandleBox = await surface
    .locator('.visual-block-controls:has(+ .visual-block-selected)')
    .boundingBox()
  expect(Math.abs(movedHandleBox!.y - movedBlockBox!.y)).toBeLessThan(4)
})

test('does not show inline formatting for a whole-block selection', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'select.md': '# Selected heading\n\nSecond paragraph.\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-select.md').click()
  const block = page.locator('.visual-editor-content .ProseMirror > .visual-block-node').first()
  const surface = page.locator('.visual-editor-content .ProseMirror')
  await block.hover()
  await blockHandle(surface, 0).click()

  await expect(surface.locator('.visual-block-selected')).toHaveCount(1)
  await expect(page.getByTestId('visual-context-menu')).toHaveCount(0)
  await expect
    .poll(() =>
      block.evaluate((element) => getComputedStyle(element, '::selection').backgroundColor),
    )
    .toBe('rgba(0, 0, 0, 0)')

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(surface.locator('.ProseMirror-selectednode')).toHaveCount(0)
  await expect(page.getByTestId('visual-context-menu')).toBeVisible()
})

test('clears block decoration after delete and reveals keyboard-focused controls', async ({
  page,
}) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'delete.md': 'One\n\nTwo\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-delete.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const firstControls = surface.locator('.visual-block-controls').first()
  await blockMenuTrigger(surface, 0).focus()
  await expect(firstControls).toHaveCSS('opacity', '1')

  await surface.locator(':scope > p').first().hover()
  await blockMenuTrigger(surface, 0).click()
  await page.getByTestId('visual-block-menu').getByRole('button', { name: 'Delete' }).click()

  await expect(surface.locator(':scope > p')).toHaveCount(1)
  await expect(surface.locator(':scope > p')).toHaveText('Two')
  await expect(surface.locator('.visual-block-selected')).toHaveCount(0)
})

test('activates a block from its content without a border or text selection', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'active.md': 'One\n\nTwo\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-active.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blocks = surface.locator(':scope > p')
  await blocks.nth(1).click()

  await expect(blocks.nth(1)).toHaveClass(/visual-block-selected/)
  await expect(surface.locator('.ProseMirror-selectednode')).toHaveCount(0)
  await expect(blocks.nth(1)).toHaveCSS('outline-style', 'none')
  await expect(blockMenuTrigger(surface, 1)).toBeVisible()
})

test('keeps the active slash command visible while navigating', async ({ page }) => {
  await openApp(page)
  const surface = page.locator('.visual-editor-content .ProseMirror')
  await surface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('/')

  const menu = page.getByTestId('visual-slash-menu')
  for (let index = 0; index < 10; index += 1) await page.keyboard.press('ArrowDown')

  await expect.poll(() => menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const menuBox = await menu.boundingBox()
  const activeBox = await menu.locator('button.active').boundingBox()
  expect(menuBox).not.toBeNull()
  expect(activeBox).not.toBeNull()
  expect(activeBox!.y).toBeGreaterThanOrEqual(menuBox!.y)
  expect(activeBox!.y + activeBox!.height).toBeLessThanOrEqual(menuBox!.y + menuBox!.height)
})

test('keeps block menu anchored, compact and scoped to its block', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'menu.md': 'One\n\nTwo\n\nThree\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-menu.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blocks = surface.locator(':scope > p')
  await blocks.nth(1).hover()
  const menuTrigger = blockMenuTrigger(surface, 1)
  await expect(menuTrigger).toBeVisible()
  const triggerBox = await menuTrigger.boundingBox()
  await page.mouse.move(
    triggerBox!.x + triggerBox!.width / 2,
    triggerBox!.y + triggerBox!.height / 2,
    {
      steps: 6,
    },
  )
  await page.waitForTimeout(550)
  await expect(menuTrigger).toBeVisible()
  await menuTrigger.click()
  const menu = page.getByTestId('visual-block-menu')
  const initialBox = await menu.boundingBox()
  await menu.getByText('Turn into').click()
  const expandedBox = await menu.boundingBox()
  expect(expandedBox!.width).toBeLessThanOrEqual(216)
  await expect(menu.locator('.visual-block-transform-list svg')).toHaveCount(12)
  await expect
    .poll(() =>
      menu
        .getByRole('button', { name: 'Heading 1' })
        .evaluate((element) => getComputedStyle(element).justifyContent),
    )
    .toBe('flex-start')

  const thirdBox = await blocks.nth(2).boundingBox()
  await page.mouse.move(thirdBox!.x + thirdBox!.width / 2, thirdBox!.y + thirdBox!.height / 2)
  const hoveredBox = await menu.boundingBox()
  expect(hoveredBox!.x).toBe(initialBox!.x)
  expect(hoveredBox!.y).toBe(initialBox!.y)
  await expect(surface.locator('.visual-block-selected')).toHaveCount(1)
  await expect(blocks.nth(0)).toHaveCSS('opacity', '0.3')
  await expect(blocks.nth(1)).toHaveCSS('opacity', '1')
  await expect(blocks.nth(2)).toHaveCSS('opacity', '0.3')

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(blocks.nth(0)).toHaveCSS('opacity', '1')
  await page.mouse.move(8, 8)
  await expect(surface.locator('.visual-block-controls').first()).toHaveCSS('opacity', '0')
})

test('closes a block menu on the second trigger click', async ({ page }) => {
  await openApp(page, { mockOptions: { initialFiles: { 'toggle.md': 'Block\n' } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-toggle.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  await surface.locator(':scope > p').hover()
  const trigger = blockMenuTrigger(surface, 0)
  await trigger.click()
  await expect(page.getByTestId('visual-block-menu')).toBeVisible()
  await trigger.click()
  await expect(page.getByTestId('visual-block-menu')).toHaveCount(0)
})

test('keeps floating block and slash menus inside the app viewport', async ({ page }) => {
  const content = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')
  await openApp(page, { mockOptions: { initialFiles: { 'bottom.md': `${content}\n` } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-bottom.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const lastBlock = surface.locator(':scope > p').last()
  await lastBlock.scrollIntoViewIfNeeded()
  await lastBlock.hover()
  await blockMenuTrigger(surface, 39).click()
  const blockMenu = page.getByTestId('visual-block-menu')
  await blockMenu.getByRole('button', { name: 'Turn into' }).click()
  await expect
    .poll(async () => {
      const box = await blockMenu.boundingBox()
      return box ? box.y + box.height : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual((await page.evaluate(() => window.innerHeight)) - 11)

  await page.keyboard.press('Escape')
  await lastBlock.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  const slashMenu = page.getByTestId('visual-slash-menu')
  await expect
    .poll(async () => {
      const box = await slashMenu.boundingBox()
      return box ? box.y + box.height : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual((await page.evaluate(() => window.innerHeight)) - 11)
})

test('aligns heading controls and gives dividers a selectable hit area', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'blocks.md':
          'Before\n\n---\n\n# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-blocks.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const divider = surface.locator(':scope > hr')
  const dividerBox = await divider.boundingBox()
  expect(dividerBox!.height).toBeGreaterThanOrEqual(25)
  await divider.click({ position: { x: 20, y: dividerBox!.height / 2 } })
  await expect(divider).toHaveClass(/ProseMirror-selectednode/)
  await expect(blockMenuTrigger(surface, 1)).toBeVisible()

  for (let level = 1; level <= 6; level += 1) {
    const heading = surface.locator(`:scope > h${level}`)
    await heading.scrollIntoViewIfNeeded()
    await heading.hover()
    const headingBox = await heading.boundingBox()
    const controlsBox = await surface
      .locator('.visual-block-controls')
      .nth(level + 1)
      .boundingBox()
    expect(Math.abs(controlsBox!.y - headingBox!.y)).toBeLessThan(4)

    const editorBox = await page.getByTestId('visual-editor').boundingBox()
    expect(controlsBox!.x).toBeGreaterThanOrEqual(editorBox!.x + 7)
  }
})

test('continues block drag autoscroll while the pointer stays at the viewport edge', async ({
  page,
}) => {
  const content = Array.from({ length: 80 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')
  await openApp(page, { mockOptions: { initialFiles: { 'long.md': `${content}\n` } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-long.md').click()

  const scroll = page.locator('.visual-editor-scroll')
  const surface = page.locator('.visual-editor-content .ProseMirror')
  const firstBlock = surface.locator(':scope > p').first()
  await firstBlock.hover()
  const handle = blockHandle(surface, 0)
  const handleBox = await handle.boundingBox()
  const viewportBox = await scroll.boundingBox()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(viewportBox!.x + 40, viewportBox!.y + viewportBox!.height - 4, { steps: 8 })
  await page.waitForTimeout(250)
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(40)
  await page.mouse.up()
})

test('clears block selection when typing into an inserted block', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'insert.md': 'Before\n\nAfter\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-insert.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blocks = surface.locator(':scope > p')
  await blocks.first().hover()
  await blockHandle(surface, 0).click()
  await blockMenuTrigger(surface, 0).click()
  await page.getByTestId('visual-block-menu').getByRole('button', { name: 'Insert below' }).click()
  await page.keyboard.type('Inserted text')

  await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(0)
  await expect(surface.locator('.visual-block-selected')).toHaveCount(1)
})

test('edits raw source blocks inline and preserves neighboring Markdown', async ({ page }) => {
  const source = ['---', 'title: Draft', '---', '', '# Body', '', 'Keep **this**.', ''].join('\n')
  await openApp(page, { mockOptions: { initialFiles: { 'raw.md': source } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-raw.md').click()

  const raw = page.locator('.raw-markdown-block').first()
  await raw.getByRole('button', { name: /Source block/ }).click()
  const field = raw.getByLabel('Edit raw Markdown block')
  await field.fill('---\ntitle: Revised\n---\n\n')
  await field.blur()

  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('title: Revised')
  await expect(page.getByTestId('source-editor')).toContainText('# Body')
  await expect(page.getByTestId('source-editor')).toContainText('Keep **this**.')
})

test('reparses a raw block when its inline editor collapses', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'raw.md': '<section>Raw HTML</section>\n\nKeep me.\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-raw.md').click()

  const raw = page.locator('.raw-markdown-block').first()
  await raw.getByRole('button', { name: /Source block/ }).click()
  await raw.getByLabel('Edit raw Markdown block').fill('Converted paragraph.\n\n')
  await raw.getByLabel('Edit raw Markdown block').blur()

  await expect(page.locator('.raw-markdown-block')).toHaveCount(0)
  await expect(page.locator('.visual-editor-content .ProseMirror p').first()).toHaveText(
    'Converted paragraph.',
  )
})

test('moves visually identical blocks by runtime identity', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'identity.md': '*Same*\n\n_Same_\n\nTail\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-identity.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blocks = surface.locator(':scope > p')
  await blocks.first().hover()
  await blockHandle(surface, 0).click()
  await page.keyboard.press('Alt+ArrowDown')
  await page.getByTestId('save-document').click()

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('identity.md'),
      ),
    )
    .toBe('_Same_\n\n*Same*\n\nTail\n')
})

test('shares undo and redo between Visual and Source projections', async ({ page }) => {
  await openApp(page, { mockOptions: { initialFiles: { 'history.md': '# History\n\nBody\n' } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-history.md').click()

  const body = page.locator('.visual-editor-content .ProseMirror p').first()
  await body.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' changed')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Body changed')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(page.getByTestId('source-editor')).not.toContainText('Body changed')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y')
  await expect(page.getByTestId('source-editor')).toContainText('Body changed')

  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Body changed')
})

test('keeps a move, duplicate and delete chain stable through undo and redo', async ({ page }) => {
  await openApp(page, {
    mockOptions: { initialFiles: { 'chain.md': 'One\n\nTwo\n\nThree\n' } },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-chain.md').click()

  const surface = page.locator('.visual-editor-content .ProseMirror')
  const blockTexts = () => surface.locator(':scope > p').allTextContents()
  const blockIds = () =>
    surface
      .locator(':scope > .visual-block-node')
      .evaluateAll((blocks) => blocks.map((block) => block.getAttribute('data-block-id')))
  const initialIds = await blockIds()
  expect(initialIds).toHaveLength(3)
  expect(new Set(initialIds).size).toBe(3)
  await surface.locator(':scope > p').first().hover()
  await blockHandle(surface, 0).click()
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'Three'])
  await expect.poll(blockIds).toEqual([initialIds[1], initialIds[0], initialIds[2]])

  await surface.locator(':scope > p').nth(1).hover()
  await blockMenuTrigger(surface, 1).click()
  await page.getByTestId('visual-block-menu').getByRole('button', { name: 'Duplicate' }).click()
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'One', 'Three'])
  const duplicatedIds = await blockIds()
  expect(duplicatedIds.slice(0, 2)).toEqual([initialIds[1], initialIds[0]])
  expect(duplicatedIds[3]).toBe(initialIds[2])
  expect(new Set(duplicatedIds).size).toBe(4)

  await surface.locator(':scope > p').nth(3).hover()
  await blockMenuTrigger(surface, 3).click()
  await page.getByTestId('visual-block-menu').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'One'])
  await expect.poll(blockIds).toEqual(duplicatedIds.slice(0, 3))

  const undo = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
  const redo = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y'
  await page.keyboard.press(undo)
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'One', 'Three'])
  await expect.poll(blockIds).toEqual(duplicatedIds)
  await page.keyboard.press(undo)
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'Three'])
  await expect.poll(blockIds).toEqual([initialIds[1], initialIds[0], initialIds[2]])
  await page.keyboard.press(undo)
  await expect.poll(blockTexts).toEqual(['One', 'Two', 'Three'])
  await expect.poll(blockIds).toEqual(initialIds)

  await page.keyboard.press(redo)
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'Three'])
  await expect.poll(blockIds).toEqual([initialIds[1], initialIds[0], initialIds[2]])
  await page.keyboard.press(redo)
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'One', 'Three'])
  await expect.poll(blockIds).toEqual(duplicatedIds)
  await page.keyboard.press(redo)
  await expect.poll(blockTexts).toEqual(['Two', 'One', 'One'])
  await expect.poll(blockIds).toEqual(duplicatedIds.slice(0, 3))
})

test('persists Visual to Source undo and redo through save and reopen', async ({ page }) => {
  const initial = '# Flow\n\nBody\n'
  const saved = '# Flow\n\nBody changed\n'
  await openApp(page, { mockOptions: { initialFiles: { 'round-trip-flow.md': initial } } })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-round-trip-flow.md').click()

  const body = page.locator('.visual-editor-content .ProseMirror p').first()
  await body.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' changed')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Body changed')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(page.getByTestId('source-editor')).not.toContainText('Body changed')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y')
  await expect(page.getByTestId('source-editor')).toContainText('Body changed')
  await page.getByTestId('save-document').click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('round-trip-flow.md'),
      ),
    )
    .toBe(saved)

  await page
    .locator('.pane-tabs .tab-button')
    .filter({ hasText: 'round-trip-flow.md' })
    .locator('.tab-close')
    .click({ force: true })
  await page.getByTestId('workspace-entry-round-trip-flow.md').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Body changed')
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Body changed')
})
