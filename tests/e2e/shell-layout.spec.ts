import { expect, test } from '@playwright/test'
import {
  applicationLayoutStorageKey,
  dragBy,
  layoutSettingLimits,
  openApp,
  readPersistedLayout,
} from './helpers'

test('shows toolbar labels only in comfortable density', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.locator('.workspace-tree-actions').getByRole('button', { name: 'New scratch document' })).toBeVisible()
  await expect(page.locator('.workspace-tree-actions').getByRole('button', { name: 'New file' })).toBeVisible()
  await expect(page.locator('.workspace-tree-actions').getByRole('button', { name: 'New folder' })).toBeVisible()

  const splitLabel = page.locator('button[title="Toggle split view"] span')
  await expect(splitLabel).toBeHidden()

  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByLabel('Density').selectOption('comfortable')
  await page.locator('button[title="Workspace"]').click()

  await expect(splitLabel).toBeVisible()
  await expect(page.getByRole('button', { name: 'Heading 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Heading 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Subtitle' })).toBeVisible()

  await page.getByRole('button', { name: 'Headings' }).click()
  const headingsTrigger = page.getByRole('button', { name: 'Headings' })
  const headingsListId = await headingsTrigger.getAttribute('aria-controls')

  expect(headingsListId).toBeTruthy()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.locator(`#${headingsListId}`)).toBeVisible()
  await expect(page.locator(`#${headingsListId}`).getByRole('menuitem')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(headingsTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator(`#${headingsListId}`)).toBeHidden()
  await expect(headingsTrigger).toBeFocused()
  await headingsTrigger.click()
  await page.getByTestId('visual-editor').click()
  await expect(page.locator(`#${headingsListId}`)).toBeHidden()
  await headingsTrigger.click()
  await page.locator(`#${headingsListId}`).getByRole('button', { name: 'Heading 4' }).click()
  await expect(page.locator(`#${headingsListId}`)).toBeHidden()
})

test('uses explicit activity rail modes and keeps sidebar labels fitted', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  const workspaceRailLabel = page.locator('.activity-button[title="Workspace"] span')
  const scratchButton = page.locator('.workspace-tree-actions button[title="New scratch document"]')
  const scratchLabel = scratchButton.locator('span')

  await expect(workspaceRailLabel).toBeHidden()
  await expect(page.locator('.activity-button[title="Settings"]')).toHaveCount(1)
  await expect(page.locator('.activity-main-items .activity-button[title="Settings"]')).toHaveCount(1)
  await expect.poll(async () => page.locator('.activity-button[title="Workspace"]').evaluate((element) => {
    const box = element.getBoundingClientRect()
    return Math.abs(Math.round(box.width) - Math.round(box.height))
  })).toBeLessThanOrEqual(1)
  await expect(scratchButton).toHaveAttribute('title', 'New scratch document')
  await expect(page.getByRole('button', { name: 'Visual' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Source' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Headings' })).toHaveAttribute('aria-expanded', 'false')

  await dragBy(page.getByTestId('activity-splitter'), 100)
  await expect.poll(async () => page.locator('.activity-bar').evaluate((element) => (
    Math.round(element.getBoundingClientRect().width)
  ))).toBeGreaterThanOrEqual(layoutSettingLimits.activityExpandedWidth.min)
  await expect(workspaceRailLabel).toBeVisible()
  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationLayoutStorageKey)).toContain('"activityRailMode":"expanded"')
  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationLayoutStorageKey)).toContain('"activityExpandedWidth"')

  await page
    .getByRole('navigation', { name: 'Activity' })
    .getByRole('button', { name: 'New scratch document' })
    .click()
  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')

  await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled()

  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(workspaceRailLabel).toBeHidden()
  await expect.poll(async () => page.locator('.activity-bar').evaluate((element) => (
    Math.round(element.getBoundingClientRect().width)
  ))).toBeLessThanOrEqual(layoutSettingLimits.activityCompactWidth.max)

  await dragBy(page.locator('.sidebar-splitter'), -160)
  await expect(scratchLabel).toBeHidden()

  await dragBy(page.locator('.sidebar-splitter'), 320)
  await expect(scratchLabel).toBeVisible()
})

test('resizes layout separators with keyboard and exposes values to assistive tech', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  const activitySeparator = page.getByRole('separator', { name: 'Resize activity bar' })
  await expect(activitySeparator).toHaveAttribute('tabindex', '0')
  await expect(activitySeparator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(activitySeparator).toHaveAttribute('aria-valuemin', String(layoutSettingLimits.activityCompactWidth.min))
  await expect(activitySeparator).toHaveAttribute('aria-valuemax', String(layoutSettingLimits.activityCompactWidth.max))
  await expect(activitySeparator).toHaveAttribute('aria-valuenow', String(layoutSettingLimits.activityCompactWidth.fallback))
  await activitySeparator.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => readPersistedLayout(page)).toMatchObject({
    activityRailMode: 'expanded',
  })
  await expect(activitySeparator).toHaveAttribute('aria-valuemin', String(layoutSettingLimits.activityExpandedWidth.min))

  const sidebarSeparator = page.getByRole('separator', { name: 'Resize sidebar' })
  await expect(sidebarSeparator).toHaveAttribute('tabindex', '0')
  await expect(sidebarSeparator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(sidebarSeparator).toHaveAttribute('aria-valuemin', String(layoutSettingLimits.sidebarWidth.min))
  await expect(sidebarSeparator).toHaveAttribute('aria-valuemax', String(layoutSettingLimits.sidebarWidth.max))
  await sidebarSeparator.focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(async () => readPersistedLayout(page)).toMatchObject({
    sidebarWidth: layoutSettingLimits.sidebarWidth.fallback - 48,
  })

  await page.locator('button[title="Toggle split view"]').click()
  const splitSeparator = page.getByRole('separator', { name: 'Resize editor panes' })
  await expect(splitSeparator).toHaveAttribute('tabindex', '0')
  await expect(splitSeparator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(splitSeparator).toHaveAttribute('aria-valuemin', '25')
  await expect(splitSeparator).toHaveAttribute('aria-valuemax', '75')
  await expect(splitSeparator).toHaveAttribute('aria-valuenow', '50')
  await splitSeparator.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => readPersistedLayout(page)).toMatchObject({
    splitRatio: 0.525,
  })
  await expect(splitSeparator).toHaveAttribute('aria-valuenow', '53')
})
