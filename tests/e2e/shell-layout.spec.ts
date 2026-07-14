import { expect, test } from '@playwright/test'
import {
  applicationSettingsStorageKey,
  applicationLayoutStorageKey,
  dragBy,
  layoutSettingLimits,
  openApp,
  readPersistedLayout,
  sourceEditor,
} from './helpers'

test('shows toolbar labels only in comfortable density', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 800 })
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await expect(
    page.locator('.workspace-tree-actions').getByRole('button', { name: 'New scratch document' }),
  ).toBeVisible()
  await expect(
    page.locator('.workspace-tree-actions').getByRole('button', { name: 'New file' }),
  ).toBeVisible()
  await expect(
    page.locator('.workspace-tree-actions').getByRole('button', { name: 'New folder' }),
  ).toBeVisible()

  const splitLabel = page.locator('button[title="Toggle split view"] span')
  await expect(splitLabel).toBeHidden()

  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByLabel('Density').selectOption('comfortable')
  await page.locator('button[title="Workspace"]').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()

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
  await sourceEditor(page).click()
  await expect(page.locator(`#${headingsListId}`)).toBeHidden()
  await headingsTrigger.click()
  await page.locator(`#${headingsListId}`).getByRole('button', { name: 'Heading 4' }).click()
  await expect(page.locator(`#${headingsListId}`)).toBeHidden()
})

test('uses explicit activity rail modes and keeps sidebar labels fitted', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 800 })
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  const workspaceRailLabel = page.locator('.activity-button[title="Workspace"] span')
  const scratchButton = page.locator('.workspace-tree-actions button[title="New scratch document"]')
  const scratchLabel = scratchButton.locator('span')

  await expect(workspaceRailLabel).toBeHidden()
  await expect(page.locator('.activity-button[title="Settings"]')).toHaveCount(1)
  await expect(page.locator('.activity-main-items .activity-button[title="Settings"]')).toHaveCount(
    1,
  )
  await expect
    .poll(async () =>
      page.locator('.activity-button[title="Workspace"]').evaluate((element) => {
        const box = element.getBoundingClientRect()
        return Math.abs(Math.round(box.width) - Math.round(box.height))
      }),
    )
    .toBeLessThanOrEqual(1)
  await expect(scratchButton).toHaveAttribute('title', 'New scratch document')
  await expect(page.getByRole('button', { name: 'Visual' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Source' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Headings' })).toHaveCount(0)

  await dragBy(page.getByTestId('activity-splitter'), 100)
  await expect
    .poll(async () =>
      page
        .locator('.activity-bar')
        .evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBeGreaterThanOrEqual(layoutSettingLimits.activityExpandedWidth.min)
  await expect(workspaceRailLabel).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationLayoutStorageKey,
      ),
    )
    .toContain('"activityRailMode":"expanded"')
  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationLayoutStorageKey,
      ),
    )
    .toContain('"activityExpandedWidth"')

  await page
    .getByRole('navigation', { name: 'Activity' })
    .getByRole('button', { name: 'Search' })
    .click()
  await expect(page.getByRole('complementary', { name: 'Search' })).toContainText(
    'Search will appear here',
  )
  await expect(page.getByTestId('document-title')).toHaveText('README.md')

  await page
    .getByRole('navigation', { name: 'Activity' })
    .getByRole('button', { name: 'Create' })
    .click()
  await expect(page.getByRole('complementary', { name: 'Create' })).toContainText(
    'Document templates will appear here',
  )
  await expect(page.getByTestId('document-title')).toHaveText('README.md')

  await page
    .getByRole('navigation', { name: 'Activity' })
    .getByRole('button', { name: 'Workspace' })
    .click()

  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(workspaceRailLabel).toBeHidden()
  const closeSidebarButton = page.getByRole('button', { name: 'Close sidebar' })
  await expect(closeSidebarButton.locator('span')).toBeHidden()
  await expect
    .poll(async () =>
      closeSidebarButton.evaluate((button) => {
        const sidebar = button.closest('.workspace-sidebar')!
        const buttonRect = button.getBoundingClientRect()
        const sidebarRect = sidebar.getBoundingClientRect()
        return (
          Math.abs(buttonRect.width - sidebarRect.width) <= 1 &&
          Math.abs(buttonRect.bottom - sidebarRect.bottom) <= 1
        )
      }),
    )
    .toBe(true)
  await expect
    .poll(async () =>
      page
        .locator('.activity-bar')
        .evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBeLessThanOrEqual(layoutSettingLimits.activityCompactWidth.max)

  await dragBy(page.locator('.sidebar-splitter'), -160)
  await expect(scratchLabel).toBeHidden()

  await dragBy(page.locator('.sidebar-splitter'), 320)
  await expect(scratchLabel).toBeHidden()

  await page.getByRole('button', { name: 'Expand rail' }).click()
  await expect(scratchLabel).toBeVisible()
})

test('switches sidebar screens and restores a closed sidebar from activity rail', async ({
  page,
}) => {
  await openApp(page)

  const activity = page.getByRole('navigation', { name: 'Activity' })
  await activity.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('complementary', { name: 'Search' })).toBeVisible()

  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await expect(page.locator('.workspace-sidebar')).toHaveCount(0)
  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationSettingsStorageKey,
      ),
    )
    .toContain('"showSidebar":false')

  await activity.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('complementary', { name: 'Create' })).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationSettingsStorageKey,
      ),
    )
    .toContain('"showSidebar":true')

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

test('keeps sidebar resize limits honest and hides it at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 800 })
  await openApp(page, {
    storageEntries: {
      [applicationLayoutStorageKey]: JSON.stringify({
        sidebarWidth: layoutSettingLimits.sidebarWidth.max,
      }),
    },
  })

  await expect
    .poll(async () =>
      page
        .locator('.workspace-sidebar')
        .evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBe(layoutSettingLimits.sidebarWidth.max)

  await page.setViewportSize({ width: 900, height: 620 })
  await expect(page.locator('.workspace-sidebar')).toHaveCount(0)
  await expect(page.locator('.topbar .labelled-icon-button span').first()).toBeHidden()
})

test('protects editor width by temporarily hiding sidebar, map and outline in order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 800 })
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'layout.md': '# Layout\n\nText for adaptive layout.\n',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-layout.md').click()

  const sidebar = page.locator('.workspace-sidebar')
  const outline = page.locator('.document-outline')
  const map = page.locator('.document-map')
  await expect(sidebar).toBeVisible()
  await expect(outline).toBeVisible()
  await expect(map).toBeVisible()
  const persistedBeforeResize = await page.evaluate(
    ([settingsKey, layoutKey]) => ({
      settings: window.localStorage.getItem(settingsKey),
      layout: window.localStorage.getItem(layoutKey),
    }),
    [applicationSettingsStorageKey, applicationLayoutStorageKey] as const,
  )

  await page.setViewportSize({ width: 1200, height: 800 })
  await expect(sidebar).toHaveCount(0)
  await expect(outline).toBeVisible()
  await expect(map).toBeVisible()
  await expect
    .poll(() =>
      page
        .getByTestId('visual-editor')
        .evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBeGreaterThanOrEqual(864)

  await page.locator('button[title="Workspace"]').click()
  await expect(sidebar).toBeVisible()
  await page.setViewportSize({ width: 1199, height: 800 })
  await expect(sidebar).toHaveCount(0)

  await page.setViewportSize({ width: 1150, height: 800 })
  await expect(sidebar).toHaveCount(0)
  await expect(outline).toBeVisible()
  await expect(map).toHaveCount(0)

  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(outline).toBeVisible()
  await expect(map).toHaveCount(0)

  await page.setViewportSize({ width: 1000, height: 800 })
  await expect(outline).toHaveCount(0)
  await expect(map).toHaveCount(0)

  expect(
    await page.evaluate(
      ([settingsKey, layoutKey]) => ({
        settings: window.localStorage.getItem(settingsKey),
        layout: window.localStorage.getItem(layoutKey),
      }),
      [applicationSettingsStorageKey, applicationLayoutStorageKey] as const,
    ),
  ).toEqual(persistedBeforeResize)

  await page.setViewportSize({ width: 1500, height: 800 })
  await expect(sidebar).toBeVisible()
  await expect(outline).toBeVisible()
  await expect(map).toBeVisible()
})

test('hides sidebar before shrinking a scratch editor', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 800 })
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page
    .locator('.workspace-tree-actions')
    .getByRole('button', { name: 'New scratch document' })
    .click()

  await page.setViewportSize({ width: 1100, height: 800 })
  await expect(page.locator('.workspace-sidebar')).toHaveCount(0)
  await expect
    .poll(() =>
      page
        .getByTestId('visual-editor')
        .evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBeGreaterThanOrEqual(864)
})

test('protects both editor panes before auxiliary panels in split view', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 800 })
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'left.md': '# Left\n\nLeft pane.\n',
        'right.md': '# Right\n\nRight pane.\n',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-left.md').click()
  await page.getByTestId('workspace-entry-right.md').click()
  await page.locator('button[title="Toggle split view"]').click()
  await page.locator('button[title="Move active tab right"]').click()

  const panes = page.locator('.editor-pane')
  await expect(panes).toHaveCount(2)
  await expect(page.locator('.workspace-sidebar')).toHaveCount(0)
  await expect(page.locator('.document-outline')).toHaveCount(0)
  await expect(page.locator('.document-map')).toHaveCount(0)
  await expect
    .poll(() =>
      panes.evaluateAll((elements) =>
        Math.min(...elements.map((element) => Math.round(element.getBoundingClientRect().width))),
      ),
    )
    .toBeGreaterThanOrEqual(864)
})

test('resizes layout separators with keyboard and exposes values to assistive tech', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1700, height: 800 })
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  const activitySeparator = page.getByRole('separator', { name: 'Resize activity bar' })
  await expect(activitySeparator).toHaveAttribute('tabindex', '0')
  await expect(activitySeparator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(activitySeparator).toHaveAttribute(
    'aria-valuemin',
    String(layoutSettingLimits.activityCompactWidth.min),
  )
  await expect(activitySeparator).toHaveAttribute(
    'aria-valuemax',
    String(layoutSettingLimits.activityCompactWidth.max),
  )
  await expect(activitySeparator).toHaveAttribute(
    'aria-valuenow',
    String(layoutSettingLimits.activityCompactWidth.fallback),
  )
  await activitySeparator.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(async () => readPersistedLayout(page))
    .toMatchObject({
      activityRailMode: 'expanded',
    })
  await expect(activitySeparator).toHaveAttribute(
    'aria-valuemin',
    String(layoutSettingLimits.activityExpandedWidth.min),
  )

  const sidebarSeparator = page.getByRole('separator', { name: 'Resize sidebar' })
  await expect(sidebarSeparator).toHaveAttribute('tabindex', '0')
  await expect(sidebarSeparator).toHaveAttribute('aria-orientation', 'vertical')
  await expect(sidebarSeparator).toHaveAttribute(
    'aria-valuemin',
    String(layoutSettingLimits.sidebarWidth.min),
  )
  await expect(sidebarSeparator).toHaveAttribute(
    'aria-valuemax',
    String(layoutSettingLimits.sidebarWidth.max),
  )
  await sidebarSeparator.focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect
    .poll(async () => readPersistedLayout(page))
    .toMatchObject({
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
  await expect
    .poll(async () => readPersistedLayout(page))
    .toMatchObject({
      splitRatio: 0.525,
    })
  await expect(splitSeparator).toHaveAttribute('aria-valuenow', '53')
})
