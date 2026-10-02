import { expect, test } from '@playwright/test'
import { applicationSettingsStorageKey, openApp, sourceEditor } from './helpers'
import { defaultApplicationSettings } from '../../src/application/settings/defaults'

test('keeps keyboard focus inside a confirmation and Enter activates Cancel', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  const entry = page.getByTestId('workspace-entry-README.md')
  await entry.click()
  const trigger = entry.getByRole('button', { name: 'Move to trash' })
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: 'Move README.md to trash?' })
  const cancel = dialog.getByRole('button', { name: 'Cancel' })
  const confirm = dialog.getByRole('button', { name: 'Move to trash' })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()

  const status = await page.getByTestId('open-documents-status').textContent()
  for (const shortcut of ['Control+N', 'Meta+N', 'Control+O', 'Meta+O']) {
    await page.keyboard.press(shortcut)
  }
  await expect(page.getByTestId('open-documents-status')).toHaveText(status!)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(entry).toBeVisible()
  await expect(trigger).toBeFocused()
})

test('Enter cancels the unsaved close prompt without saving or discarding the document', async ({
  page,
}) => {
  await openApp(page)
  await page.locator('.welcome-view').getByRole('button', { name: 'New document' }).click()
  await page.getByRole('button', { name: 'Source' }).click()
  const editor = sourceEditor(page)
  await editor.click()
  await page.keyboard.insertText('Keep these unsaved changes.')

  await page.evaluate(() =>
    (
      window as Window & {
        __FOLDEN_TAURI_MOCK__?: { requestWindowClose: () => Promise<void> }
      }
    ).__FOLDEN_TAURI_MOCK__?.requestWindowClose(),
  )

  const dialog = page.getByRole('dialog', { name: 'Close Folden?' })
  const cancel = dialog.getByRole('button', { name: 'Cancel' })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Save all' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Control+S')
  await page.keyboard.press('Meta+S')
  for (const shortcut of ['Control+Z', 'Meta+Z', 'Control+Y', 'Meta+Y']) {
    await page.keyboard.press(shortcut)
    await expect(editor, `${shortcut} keeps unsaved content`).toContainText(
      'Keep these unsaved changes.',
    )
  }
  await page.keyboard.press('Enter')

  await expect(dialog).toHaveCount(0)
  await expect(editor).toContainText('Keep these unsaved changes.')
  await expect(editor).toBeFocused()
  await expect(page.getByTestId('open-documents-status')).toHaveText('1 open · 1 unsaved')
  expect(
    await page.evaluate(() =>
      (
        window as Window & {
          __FOLDEN_TAURI_MOCK__?: { isWindowDestroyed: () => boolean }
        }
      ).__FOLDEN_TAURI_MOCK__?.isWindowDestroyed(),
    ),
  ).toBe(false)
})

for (const mode of ['Source', 'Visual'] as const) {
  test(`${mode} link dialog blocks document commands and resumes them after Cancel`, async ({
    page,
  }) => {
    const original = '# Modal notes\n\nOriginal text. [Reference](https://example.com).\n'
    const edit = 'Preserve this edit.'
    await openApp(page, {
      storageEntries: {
        [applicationSettingsStorageKey]: JSON.stringify({
          ...defaultApplicationSettings,
          language: 'en',
          autosave: { ...defaultApplicationSettings.autosave, enabled: false },
        }),
      },
      mockOptions: { initialFiles: { 'modal.md': original } },
    })
    await page.getByTestId('open-folder-empty').click()
    await page.getByTestId('workspace-entry-modal.md').click()
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await sourceEditor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.insertText(edit)
    if (mode === 'Visual') {
      await page.getByRole('button', { name: 'Visual', exact: true }).click()
      await page.getByTestId('visual-editor').getByRole('link', { name: 'Reference' }).click()
    }
    const editor =
      mode === 'Source' ? sourceEditor(page) : page.getByTestId('visual-editor').locator('.tiptap')
    await expect(editor).toContainText(edit)
    const status = await page.getByTestId('open-documents-status').textContent()
    if (mode === 'Source') {
      await page
        .locator('.shared-toolbar')
        .getByRole('button', { name: 'Link', exact: true })
        .click()
    } else {
      await page
        .getByTestId('visual-context-menu')
        .getByRole('button', { name: 'Edit link' })
        .click()
    }
    const dialog = page.getByRole('dialog', { name: 'Edit link' })
    const urlInput = dialog.getByRole('textbox', { name: 'Link URL' })
    await expect(urlInput).toBeFocused()

    for (const modifier of ['Control', 'Meta']) {
      for (const key of ['N', 'S', 'Z', 'P', 'F', 'H']) {
        await page.keyboard.press(`${modifier}+${key}`)
        await expect(editor, `${modifier}+${key} keeps document content`).toContainText(edit)
      }
    }
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(dialog).toBeVisible()
    await expect(editor).toContainText(edit)
    await expect(page.getByTestId('document-title')).toHaveText('modal.md')
    await expect(page.getByTestId('open-documents-status')).toHaveText(status!)
    await expect(page.locator('.find-panel')).toHaveCount(0)
    const readFile = () =>
      page.evaluate(() =>
        (
          window as typeof window & {
            __FOLDEN_TAURI_MOCK__?: { readFile: (path: string) => string | null }
          }
        ).__FOLDEN_TAURI_MOCK__?.readFile('modal.md'),
      )
    expect(await readFile()).toBe(original)

    const initialUrl = await urlInput.inputValue()
    await urlInput.selectText()
    await page.keyboard.insertText('https://example.com/edited')
    await page.keyboard.press('Control+Z')
    await expect(urlInput).toHaveValue(initialUrl)
    await expect(editor).toContainText(edit)

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await page.keyboard.press('Control+S')
    await expect.poll(readFile).toContain(edit)
    const openCount = Number(status!.match(/^(\d+) open/)![1])
    await page.keyboard.press('Control+N')
    await expect(page.getByTestId('document-title')).toHaveText('Untitled.md')
    await expect(page.getByTestId('open-documents-status')).toHaveText(`${openCount + 1} open`)
  })
}
