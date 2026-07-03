import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  applicationLayoutStorageKey,
  applicationSettingLimits,
  applicationSettingsStorageKey,
  layoutSettingLimits,
} from '../../src/infrastructure/settings/settings'
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

async function dragBy(locator: Locator, deltaX: number) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()

  await locator.page().mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await locator.page().mouse.down()
  await locator.page().mouse.move(box!.x + box!.width / 2 + deltaX, box!.y + box!.height / 2, { steps: 8 })
  await locator.page().mouse.up()
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

  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open · 1 unsaved')
  await expect(page.locator('.topbar')).not.toContainText('unsaved')

  await page.getByRole('button', { name: 'Visual' }).click()
  await expect(page.getByTestId('visual-editor')).toContainText('Edited by Playwright.')

  await page.getByRole('button', { name: 'Source' }).click()
  await expect(page.getByTestId('source-editor')).toContainText('Edited by Playwright.')

  await page.getByTestId('save-document').click()

  await expect(page.getByTestId('open-documents-status')).toHaveText('2 open')
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

  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved')
  expect(await page.getByTestId('visual-editor').evaluate((node, previousNode) => (
    node.isSameNode(previousNode as Node)
  ), visualNode)).toBe(true)
})

test('exports a local diagnostics report from settings', async ({ page }) => {
  await openApp(page)

  await page.locator('button[title="Settings"]').click()
  await page.getByRole('button', { name: 'Appearance' }).click()
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

  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved')
  await expect(page.getByTestId('workspace-entry-notes\\daily.md')).toBeVisible()
  await expect(page.getByTestId('workspace-entry-notes')).toBeVisible()
})

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

  await page.locator('summary[title="Headings"]').click()
  await expect(page.locator('.toolbar-menu[open]')).toHaveCount(1)
  await page.getByTestId('visual-editor').click()
  await expect(page.locator('.toolbar-menu[open]')).toHaveCount(0)
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
  await expect(scratchButton.locator('svg')).toHaveClass(/lucide-file-pen-line/)
  await expect(page.locator('.topbar-mode-switch')).toHaveCSS('border-bottom-width', '0px')
  await expect(page.locator('summary[title="Headings"] .toolbar-menu-chevron')).toBeVisible()

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
  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationSettingsStorageKey)).toContain('"enabled":false')
})

test('keeps settings number input editable and stores autosave delay as milliseconds', async ({ page }) => {
  await openApp(page)
  await page.locator('button[title="Settings"]').click()
  await expect(page.locator('.topbar')).toHaveCount(0)
  await expect(page.locator('.statusbar')).toHaveCount(0)
  await expect(page.getByTestId('document-title')).toHaveCount(0)

  const sourceSize = page.getByLabel('Source size')
  await sourceSize.fill('1')
  await expect(sourceSize).toHaveValue('1')
  await sourceSize.blur()
  await expect(sourceSize).toHaveValue(String(applicationSettingLimits.sourceFontSize.min))

  await page.getByRole('button', { name: 'Files' }).click()
  const autosaveDelay = page.getByLabel('Autosave delay')
  await expect(autosaveDelay).toHaveValue(String(applicationSettingLimits.autosaveDebounceMs.fallback / 1000))
  await autosaveDelay.fill('2.5')
  await autosaveDelay.blur()

  await expect.poll(async () => page.evaluate((storageKey) => (
    window.localStorage.getItem(storageKey)
  ), applicationSettingsStorageKey)).toContain('"debounceMs":2500')
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
  await expect(page.getByTestId('open-documents-status')).not.toContainText('unsaved', { timeout: 5000 })

  await expect.poll(async () => page.evaluate(() => (
    (window as Window & {
      __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
    }).__FOLDEN_TAURI_MOCK__?.readFile('README.md')
  ))).toContain('Autosaved change.')

  await page.locator('.workspace-tree-actions').getByRole('button', { name: 'New scratch document' }).click()
  await page.getByRole('button', { name: 'Source' }).click()

  const scratchEditor = sourceEditor(page)
  await scratchEditor.click()
  await page.keyboard.type('Scratch should stay dirty')

  await page.waitForTimeout(1600)
  await expect(page.getByTestId('open-documents-status')).toContainText('1 unsaved')
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
  await expect(page.getByTestId('open-documents-status')).toContainText('1 unsaved')
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
  await expect(page.locator('.topbar-title').getByTestId('load-remote-images')).toBeVisible()
  await expect(page.locator('.shared-toolbar').getByTestId('load-remote-images')).toHaveCount(0)

  await page.waitForTimeout(300)
  expect(remoteRequests).toEqual([])

  await page.getByTestId('load-remote-images').click()
  await expect.poll(() => remoteRequests.length).toBeGreaterThan(0)
  await expect(page.locator('img[src="https://example.com/preview.png"]')).toBeVisible()
})

test('opens visual links with Ctrl click without hijacking normal editing clicks', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  await page.getByRole('button', { name: 'Source' }).click()

  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.insertText([
    '',
    '[Jump](#target-heading)',
    '',
    ...Array.from({ length: 24 }, (_, index) => `filler line ${index + 1}`),
    '',
    '## Target Heading',
    '',
    '[Example](https://example.com/docs)',
    '',
  ].join('\n'))
  await page.evaluate(() => {
    Object.assign(window, {
      __FOLDEN_OPENED_LINK__: null,
      open: (url: string) => {
        Object.assign(window, { __FOLDEN_OPENED_LINK__: url })
        return null
      },
    })
  })

  await page.getByRole('button', { name: 'Visual' }).click()
  const scrollHost = page.locator('.visual-editor-scroll')
  await scrollHost.evaluate((node) => {
    node.scrollTop = 0
  })
  await page.locator('.visual-editor-content a[href="#target-heading"]').click()
  await expect.poll(async () => scrollHost.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)

  const link = page.locator('.visual-editor-content a[href="https://example.com/docs"]')
  await link.click()
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __FOLDEN_OPENED_LINK__?: string | null }).__FOLDEN_OPENED_LINK__
  ))).toBe(null)

  await link.click({ modifiers: ['Control'] })
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __FOLDEN_OPENED_LINK__?: string | null }).__FOLDEN_OPENED_LINK__
  ))).toBe('https://example.com/docs')
})
