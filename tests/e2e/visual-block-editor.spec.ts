import { expect, type Locator, test } from '@playwright/test'
import { openApp } from './helpers'

function blockHandle(surface: Locator, index: number) {
  return surface.locator('.visual-block-controls').nth(index).getByTestId('visual-block-handle')
}

function blockMenuTrigger(surface: Locator, index: number) {
  return surface
    .locator('.visual-block-controls')
    .nth(index)
    .getByTestId('visual-block-menu-trigger')
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
  await openApp(page)
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
