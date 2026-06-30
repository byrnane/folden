import { expect, test, type Locator, type Page } from '@playwright/test'
import { applicationSettingsStorageKey } from '../../src/settings'
import { installTauriMock } from './tauriMock'

type OpenAppOptions = {
  mockOptions?: Parameters<typeof installTauriMock>[1]
  storageEntries?: Record<string, string>
}

async function openApp(page: Page, options: OpenAppOptions = {}) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.addInitScript((storageEntries: Record<string, string>) => {
    window.localStorage.clear()

    for (const [key, value] of Object.entries(storageEntries)) {
      window.localStorage.setItem(key, value)
    }
  }, options.storageEntries ?? {})
  await installTauriMock(page, options.mockOptions)
  await page.goto('/')
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(resolve)))

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
}

function sourceEditor(host: Page | Locator) {
  return host.getByTestId('source-editor').locator('.cm-content')
}

test('opens a mocked workspace and saves an edited Markdown document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByRole('heading', { name: 'FoldenE2E' })).toBeVisible()
  await expect(page.getByTestId('workspace-root')).toContainText('C:\\FoldenE2E')
  await expect(page.getByTestId('workspace-tree')).toContainText('README.md')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('.cache')

  await page.getByTestId('workspace-entry-README.md').click()

  await expect(page.getByTestId('document-title')).toHaveText('README.md')
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\README.md')

  await page.getByRole('button', { name: 'Source' }).click()
  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nEdited by Playwright.\n')

  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')

  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Edited by Playwright.')

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Edited by Playwright.')

  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\README.md')
})

test('closes the window after saving dirty documents from the close prompt', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nClose after save.\n')

  await page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: {
        requestWindowClose: () => Promise<void>
      }
    }).__FOLDEN_TAURI_MOCK__?.requestWindowClose()
  ))

  await expect(page.getByRole('dialog', { name: 'Close Folden?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { isWindowDestroyed: () => boolean }
    }).__FOLDEN_TAURI_MOCK__?.isWindowDestroyed()
  ))).toBe(false)

  await page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: {
        requestWindowClose: () => Promise<void>
      }
    }).__FOLDEN_TAURI_MOCK__?.requestWindowClose()
  ))
  await page.getByRole('button', { name: 'Save all' }).click()

  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { isWindowDestroyed: () => boolean }
    }).__FOLDEN_TAURI_MOCK__?.isWindowDestroyed()
  ))).toBe(true)
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
    }).__FOLDEN_TAURI_MOCK__?.readFile('README.md')
  ))).toContain('Close after save.')
})

test('keeps the visual editor mounted after saving an open visual document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nVisual save should not remount.\n')
  await page.getByRole('button', { name: 'Visual' }).click()

  await expect(page.getByTestId('visual-editor')).toContainText('Visual save should not remount.')
  const visualNode = await page.getByTestId('visual-editor').elementHandle()
  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)
  expect(await page.getByTestId('visual-editor').evaluate((node, previousNode) => (
    node.isSameNode(previousNode as Node)
  ), visualNode)).toBe(true)
})

test('exports a local diagnostics report from the toolbar', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('export-diagnostics').click()

  await expect(page.locator('.warning-message')).toContainText('Diagnostics exported to C:\\FoldenAppData\\folden-diagnostics.txt')
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { getDiagnosticExportCount: () => number }
    }).__FOLDEN_TAURI_MOCK__?.getDiagnosticExportCount()
  ))).toBe(1)
})

test('expands workspace folders lazily and opens nested files', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByTestId('workspace-tree')).toContainText('notes')
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toHaveCount(0)

  await page.getByTestId('workspace-entry-notes').click()
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toBeVisible()

  await page.getByTestId('workspace-entry-notes\\daily.md').click()
  await expect(page.getByTestId('document-title')).toHaveText('daily.md')
  await expect(page.getByTestId('status-path')).toContainText('C:\\FoldenE2E\\notes\\daily.md')
})

test('keeps nested workspace files visible after saving edits', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-notes').click()
  await page.getByTestId('workspace-entry-notes\\daily.md').click()

  await page.getByRole('button', { name: 'Source' }).click()
  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nKeep me visible.\n')
  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toBeVisible()
  await expect(page.getByTestId('workspace-entry-notes')).toBeVisible()
})

test('keeps split source and visual panes in sync for the same document', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()

  await page.locator('button[title="Toggle split view"]').click()
  await page.getByRole('button', { name: 'Open Right' }).click()

  const panes = page.locator('.editor-pane')
  const leftPane = panes.nth(0)
  const rightPane = panes.nth(1)

  await leftPane.getByRole('button', { name: 'Source' }).click()
  const leftEditor = sourceEditor(leftPane)
  await leftEditor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nShared from source.\n')

  await rightPane.getByRole('button', { name: 'Visual' }).click()
  await expect(rightPane.getByTestId('visual-editor')).toContainText('Shared from source.')

  const visualSurface = rightPane.locator('.visual-editor-content .ProseMirror')
  await visualSurface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('Visual side sync.')

  await expect(leftPane.getByTestId('source-editor')).toContainText('Visual side sync.')
})

test('loads persisted settings before opening a workspace', async ({ page }) => {
  await openApp(page, {
    storageEntries: {
      [applicationSettingsStorageKey]: JSON.stringify({
        autosave: {
          enabled: true,
          debounceMs: 1200,
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

  await expect(page.getByRole('checkbox')).toBeChecked()
  await page.getByTestId('open-folder-empty').click()

  await expect(page.getByTestId('workspace-tree')).toContainText('README.md')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('.cache')
  await expect(page.getByTestId('workspace-tree')).not.toContainText('notes')

  await page.getByRole('checkbox').uncheck()
  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationSettingsStorageKey)).toContain('"enabled":false')
})

test('autosaves existing files but does not autosave scratch documents', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\nAutosaved change.\n')

  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')
  await expect(page.getByTestId('dirty-marker')).toHaveCount(0, { timeout: 5000 })

  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
    }).__FOLDEN_TAURI_MOCK__?.readFile('README.md')
  ))).toContain('Autosaved change.')

  await page.getByRole('button', { name: 'New scratch document' }).click()
  await page.getByRole('button', { name: 'Source' }).click()

  const scratchEditor = sourceEditor(page)
  await scratchEditor.click()
  await page.keyboard.type('Scratch should stay dirty')

  await page.waitForTimeout(1600)
  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')
  await expect(page.getByTestId('status-path')).toContainText('Scratch')
})

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
  await expect(page.getByTestId('dirty-marker')).toContainText('1 unsaved')
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
  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)

  await page.getByRole('button', { name: 'README.md' }).locator('.tab-close').click()

  await expect(page.getByRole('dialog', { name: 'Close README.md?' })).toHaveCount(0)
  await expect(page.getByTestId('dirty-marker')).toHaveCount(0)
  await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
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
  await expect(page.getByRole('button', { name: 'README (conflict copy).md' })).toBeVisible()
})

test('keeps remote images blocked until the document explicitly allows them', async ({ page }) => {
  const remoteRequests: string[] = []

  await openApp(page)
  await page.route('https://example.com/**', async (route) => {
    remoteRequests.push(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pX6lz0AAAAASUVORK5CYII=',
        'base64',
      ),
    })
  })

  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.type('\n![remote](https://example.com/preview.png)\n')

  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Remote image is blocked.')
  await expect(page.getByTestId('load-remote-images')).toBeVisible()

  await page.waitForTimeout(300)
  expect(remoteRequests).toEqual([])

  await page.getByTestId('load-remote-images').click()
  await expect.poll(() => remoteRequests.length).toBeGreaterThan(0)
  await expect(page.locator('img[src="https://example.com/preview.png"]')).toBeVisible()
})
