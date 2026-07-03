import { expect, test } from '@playwright/test'
import {
  documentDragMimeType,
  openApp,
  sourceEditor,
} from './helpers'

test('keeps split source and visual panes in sync for the same document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await page.locator('button[title="Toggle split view"]').click()
  await page.locator('button[title="Move active tab right"]').click()
  await expect(page.locator('button[title="Move active tab left"]')).toBeVisible()

  const panes = page.locator('.editor-pane')
  const leftPane = panes.nth(0)
  const rightPane = panes.nth(1)

  await leftPane.click()
  await page.getByTestId('workspace-entry-README.md').click()

  await page.getByRole('button', { name: 'Source' }).click()
  const leftEditor = sourceEditor(leftPane)
  await leftEditor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nShared from source.\n')

  await rightPane.click()
  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(rightPane.getByTestId('visual-editor')).toContainText('Shared from source.')

  const visualSurface = rightPane.locator('.visual-editor-content .ProseMirror')
  await visualSurface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('Visual side sync.')

  await expect(leftPane.getByTestId('source-editor')).toContainText('Visual side sync.')
})

test('reorders tabs with drag and drop', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()

  const leftTabs = page.locator('.editor-pane').first().locator('.pane-tabs .tab-button')
  await expect(leftTabs.nth(0)).toContainText('Untitled.md')
  await expect(leftTabs.nth(1)).toContainText('README.md')
  await expect(leftTabs.nth(2)).toContainText('daily.md')

  const sourceBox = await leftTabs.nth(2).boundingBox()
  const targetBox = await leftTabs.nth(1).boundingBox()

  expect(sourceBox).not.toBeNull()
  expect(targetBox).not.toBeNull()

  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect(leftTabs.nth(1)).toContainText('daily.md')
  await expect(leftTabs.nth(2)).toContainText('README.md')
})

test('keeps the next tab click active after a cancelled pointer drag', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()

  const tabs = page.locator('.editor-pane').first().locator('.pane-tabs .tab-button')
  const readmeTab = tabs.filter({ hasText: 'README.md' })
  const dailyTab = tabs.filter({ hasText: 'daily.md' })
  await dailyTab.click()
  await expect(page.getByTestId('document-title')).toHaveText('daily.md')

  const box = await readmeTab.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height + 260, { steps: 8 })
  await page.mouse.up()

  await readmeTab.click()
  await expect(page.getByTestId('document-title')).toHaveText('README.md')
})

test('ignores malformed document drag payloads', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()

  const leftTabs = page.locator('.editor-pane').first().locator('.pane-tabs .tab-button')
  await expect(leftTabs).toHaveCount(3)
  const beforeDrop = await leftTabs.allTextContents()

  await leftTabs.nth(1).evaluate((target, mimeType) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData(mimeType, '{"kind":"tab","documentId":42,"paneId":"left"}')
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }))
  }, documentDragMimeType)

  await expect(leftTabs).toHaveCount(3)
  expect(await leftTabs.allTextContents()).toEqual(beforeDrop)
})

test('shows split open editors and marks the active pane document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.locator('button[title="Toggle split view"]').click()
  await page.locator('button[title="Move active tab right"]').click()
  await page.locator('.editor-pane').first().click()
  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()
  await page.getByRole('button', { name: 'Source' }).click()
  await sourceEditor(page).click()
  await page.keyboard.type('Dirty open editor marker')

  const openEditors = page.locator('.open-editors')
  await expect(openEditors.locator('.open-editor-row.active')).toHaveCount(2)
  await expect(openEditors.locator('.open-editor-row.active-pane-document')).toContainText('daily.md')
  await expect(openEditors.locator('.open-editor-row.active-pane-document .open-editor-dirty-dot')).toHaveCount(1)

  await page.locator('.editor-pane').nth(1).click()
  await expect(openEditors.locator('.open-editor-row.active-pane-document')).toContainText('README.md')
  await expect(openEditors.locator('.open-editor-row').filter({ hasText: 'daily.md' }).locator('.open-editor-dirty-dot')).toHaveCount(1)
})

test('asks before closing a dirty document tab', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
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
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved')

  await page.getByRole('button', { name: 'README.md' }).locator('.tab-close').click()

  await expect(page.getByRole('dialog', { name: 'Close README.md?' })).toHaveCount(0)
  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved')
  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
})
