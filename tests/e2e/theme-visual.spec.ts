import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

const screenshotOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
}

test('keeps Folden Dark editor, settings and dialog visuals stable', async ({ page }) => {
  await openApp(page)

  await expect(page).toHaveScreenshot('folden-dark-editor.png', screenshotOptions)

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await expect(page.locator('.welcome-view')).toHaveCount(0)
  await expect(page).toHaveScreenshot('folden-dark-appearance.png', screenshotOptions)

  await page.setViewportSize({ width: 640, height: 720 })
  await expect(page).toHaveScreenshot('folden-dark-appearance-narrow.png', screenshotOptions)

  await page.setViewportSize({ width: 1500, height: 800 })
  await page.getByRole('button', { name: 'Workspace' }).click()
  await page.getByTestId('open-folder-empty').click()
  await page.locator('.workspace-tree-actions').getByRole('button', { name: 'New file' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveScreenshot('folden-dark-dialog.png', screenshotOptions)
})
