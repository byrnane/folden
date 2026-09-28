import { expect, test } from '@playwright/test'
import {
  applicationSettingLimits,
  applicationSettingsStorageKey,
  openApp,
  sourceEditor,
} from './helpers'

test('exports a local diagnostics report from settings', async ({ page }) => {
  await openApp(page)

  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByTestId('export-diagnostics').click()

  await expect(page.locator('.warning-message')).toContainText(
    'Diagnostics exported to C:\\FoldenAppData\\folden-diagnostics.txt',
  )
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { getDiagnosticExportCount: () => number }
          }
        ).__FOLDEN_TAURI_MOCK__?.getDiagnosticExportCount(),
      ),
    )
    .toBe(1)
})

test('loads persisted settings before opening a workspace', async ({ page }) => {
  await openApp(page, {
    storageEntries: {
      [applicationSettingsStorageKey]: JSON.stringify({
        autosave: {
          enabled: true,
          debounceMs: applicationSettingLimits.autosaveDebounceMs.fallback,
        },
        remoteImages: {
          policy: 'blocked',
        },
        workspace: {
          ignoredNames: ['notes'],
        },
      }),
    },
  })

  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Files' }).click()
  await expect(page.getByRole('checkbox', { name: /^Autosave / })).toBeChecked()
  await page.locator('button[title="Workspace"]').click()
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByTestId('workspace-tree')).toContainText('README.md')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('.cache')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('notes')

  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Files' }).click()
  await page.getByRole('checkbox', { name: /^Autosave / }).uncheck()
  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationSettingsStorageKey,
      ),
    )
    .toContain('"enabled":false')
})

test('keeps settings number input editable and stores autosave delay as milliseconds', async ({
  page,
}) => {
  await openApp(page)
  await page.locator('button[title="Settings"]').click()
  await expect(page.locator('.topbar')).toHaveCount(0)
  await expect(page.locator('.statusbar')).toHaveCount(0)
  await expect(page.getByTestId('document-title')).toHaveCount(0)

  const sourceSize = page.getByLabel('Source size')
  await expect(sourceSize).not.toHaveCSS('user-select', 'none')
  await sourceSize.fill('1')
  await expect(sourceSize).toHaveValue('1')
  await sourceSize.blur()
  await expect(sourceSize).toHaveValue(String(applicationSettingLimits.sourceFontSize.min))

  await page.getByRole('button', { name: 'Files' }).click()
  const autosaveDelay = page.getByLabel('Autosave delay')
  await expect(autosaveDelay).toHaveValue(
    String(applicationSettingLimits.autosaveDebounceMs.fallback / 1000),
  )
  await autosaveDelay.fill('2.5')
  await autosaveDelay.blur()

  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationSettingsStorageKey,
      ),
    )
    .toContain('"debounceMs":2500')
})

test('applies and persists the selected application theme', async ({ page }) => {
  await openApp(page)

  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'folden-dark')
  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await expect(page.getByTestId('theme-select')).toHaveValue('folden-dark')
  await page.getByLabel('UI scale').fill('1.1')
  await page.getByLabel('UI scale').blur()

  await expect
    .poll(async () =>
      page.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        applicationSettingsStorageKey,
      ),
    )
    .toContain('"theme":"folden-dark"')
})

test('autosaves existing files but does not autosave scratch documents', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Files' }).click()
  await page.getByRole('checkbox', { name: /^Autosave / }).check()
  await page.locator('button[title="Workspace"]').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nAutosaved change.\n')

  await expect(page.getByTestId('open-documents-status')).toContainText('1 unsaved')
  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved', {
    timeout: 5000,
  })

  await expect
    .poll(async () =>
      page.evaluate(() =>
        (
          window as Window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('README.md'),
      ),
    )
    .toContain('Autosaved change.')

  await page
    .locator('.workspace-tree-actions')
    .getByRole('button', { name: 'New scratch document' })
    .click()
  await page.getByRole('button', { name: 'Source' }).click()

  const scratchEditor = sourceEditor(page)
  await scratchEditor.click()
  await page.keyboard.type('Scratch should stay dirty')

  await page.waitForTimeout(1600)
  await expect(page.getByTestId('open-documents-status')).toContainText('1 unsaved')
  await expect(page.getByTestId('status-path')).toContainText('Scratch')
})
