import { expect, test } from '@playwright/test'
import {
  openApp,
  sourceEditor,
} from './helpers'

test('restores recovery snapshots into the original document on startup', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      recoveryEntries: [
        {
          key: 'file:c:\\foldene2e\\readme.md',
          kind: 'saved',
          path: 'C:\\FoldenE2E\\README.md',
          workspaceRootPath: 'C:\\FoldenE2E',
          relativePath: 'README.md',
          name: 'README.md',
          content: '# E2E Note\n\nRecovered text.\n',
          fileFormat: {
            lineEnding: 'lf',
            hasUtf8Bom: false,
          },
          fingerprint: {
            size: 30,
            modifiedAtMs: 1_800_000_000_005,
          },
          updatedAtMs: 1_800_000_000_010,
        },
      ],
    },
  })

  await expect(page.getByRole('dialog', { name: 'Recovered changes for README.md' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore' }).click()

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('source-editor')).toContainText('Recovered text.')
  await expect(page.getByTestId('open-documents-status')).toContainText('1 unsaved')
})

test('shows a readable conflict diff and preserves the dirty copy when reloading disk content', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nLocal conflict line.\n')

  await page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: {
        emitFsChange: (path: string, content: string) => void
      }
    }).__FOLDEN_TAURI_MOCK__?.emitFsChange('README.md', '# E2E Note\n\nDisk version wins.\n')
  ))

  await expect(page.getByTestId('conflict-warning')).toBeVisible()
  await page.getByTestId('resolve-conflict').click()

  await expect(page.getByRole('dialog', { name: 'Resolve conflict for README.md' })).toBeVisible()
  await expect(page.getByTestId('conflict-diff')).toContainText('Local conflict line.')
  await expect(page.getByTestId('conflict-diff')).toContainText('Disk version wins.')

  await page.getByRole('button', { name: 'Reload disk version' }).click()

  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('source-editor')).toContainText('Disk version wins.')
  await expect(page.locator('.pane-tabs').getByRole('button', { name: 'README (conflict copy).md' })).toBeVisible()
})
