import { expect, test } from '@playwright/test'
import {
  applicationSettingsStorageKey,
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

  await page.getByRole('navigation', { name: 'Activity' }).getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('complementary', { name: 'Search' })).toContainText('Search will appear here')
  await expect(page.getByTestId('document-title')).toHaveText('README.md')

  await page.getByRole('navigation', { name: 'Activity' }).getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('complementary', { name: 'Create' })).toContainText('Document templates will appear here')
  await expect(page.getByTestId('document-title')).toHaveText('README.md')

  await page.getByRole('navigation', { name: 'Activity' }).getByRole('button', { name: 'Workspace' }).click()

  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(workspaceRailLabel).toBeHidden()
  const closeSidebarButton = page.getByRole('button', { name: 'Close sidebar' })
  await expect(closeSidebarButton.locator('span')).toBeHidden()
  await expect.poll(async () => closeSidebarButton.evaluate((button) => {
    const sidebar = button.closest('.workspace-sidebar')!
    const buttonRect = button.getBoundingClientRect()
    const sidebarRect = sidebar.getBoundingClientRect()
    return Math.abs(buttonRect.width - sidebarRect.width) <= 1
      && Math.abs(buttonRect.bottom - sidebarRect.bottom) <= 1
  })).toBe(true)
  await expect.poll(async () => page.locator('.activity-bar').evaluate((element) => (
    Math.round(element.getBoundingClientRect().width)
  ))).toBeLessThanOrEqual(layoutSettingLimits.activityCompactWidth.max)

  await dragBy(page.locator('.sidebar-splitter'), -160)
  await expect(scratchLabel).toBeHidden()

  await dragBy(page.locator('.sidebar-splitter'), 320)
  await expect(scratchLabel).toBeHidden()

  await page.getByRole('button', { name: 'Expand rail' }).click()
  await expect(scratchLabel).toBeVisible()
})

test('switches sidebar screens and restores a closed sidebar from activity rail', async ({ page }) => {
  await openApp(page)

  const activity = page.getByRole('navigation', { name: 'Activity' })
  await activity.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('complementary', { name: 'Search' })).toBeVisible()

  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(page.locator('.workspace-sidebar')).toHaveCount(0)
  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationSettingsStorageKey)).toContain('"showSidebar":false')

  await activity.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('complementary', { name: 'Create' })).toBeVisible()
  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationSettingsStorageKey)).toContain('"showSidebar":true')

  await activity.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('complementary', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeDisabled()
})

test('keeps document text selectable while service chrome is not', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByRole('navigation', { name: 'Activity' })).toHaveCSS('user-select', 'none')
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCSS('user-select', 'none')
  await expect(page.getByTestId('visual-editor')).not.toHaveCSS('user-select', 'none')
})

test('keeps sidebar resize limits honest while compacting narrow windows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openApp(page, {
    storageEntries: {
      [applicationLayoutStorageKey]: JSON.stringify({
        sidebarWidth: layoutSettingLimits.sidebarWidth.max,
      }),
    },
  })

  await expect.poll(async () => page.locator('.workspace-sidebar').evaluate((element) => (
    Math.round(element.getBoundingClientRect().width)
  ))).toBe(layoutSettingLimits.sidebarWidth.max)

  await page.setViewportSize({ width: 900, height: 620 })
  await expect.poll(async () => page.locator('.workspace-sidebar').evaluate((element) => (
    Math.round(element.getBoundingClientRect().width)
  ))).toBeLessThanOrEqual(Math.round(900 * 0.3))
  await expect(page.locator('.topbar .labelled-icon-button span').first()).toBeHidden()
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
