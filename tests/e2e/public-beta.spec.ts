import { expect, test, type Page } from '@playwright/test'
import metadata from '../../package.json' with { type: 'json' }
import { openApp, sourceEditor } from './helpers'

type PrintProbeWindow = typeof window & {
  __PUBLIC_BETA_PRINT__: {
    calls: number
    snapshots: string[]
    resolve: () => void
    reject: (message: string) => void
  }
}

async function installPromisePrinter(page: Page) {
  await page.evaluate(() => {
    const target = window as PrintProbeWindow
    const state: PrintProbeWindow['__PUBLIC_BETA_PRINT__'] = {
      calls: 0,
      snapshots: [],
      resolve: () => {},
      reject: () => {},
    }
    target.__PUBLIC_BETA_PRINT__ = state
    window.print = () => {
      state.calls++
      state.snapshots.push(document.querySelector('.folden-print-view')?.textContent ?? '')
      return new Promise<void>((resolve, reject) => {
        state.resolve = resolve
        state.reject = (message) => reject(new Error(message))
      })
    }
  })
}

test('shows About and lazy usage terms while blocking background editor shortcuts', async ({
  page,
}) => {
  await openApp(page)
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-README.md').click()
  const status = await page.getByTestId('open-documents-status').textContent()
  await installPromisePrinter(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  const trigger = page.getByRole('button', {
    name: 'About Folden',
    exact: true,
  })
  await trigger.click()
  const dialog = page.getByRole('dialog', {
    name: 'About Folden',
    exact: true,
  })
  await expect(dialog).toContainText(metadata.version)
  await expect(dialog.locator('pre')).toHaveCount(0)

  for (const shortcut of [
    'Control+N',
    'Meta+N',
    'Control+O',
    'Meta+O',
    'Control+S',
    'Meta+S',
    'Control+P',
    'Meta+P',
    'Control+F',
    'Meta+F',
    'Control+Alt+P',
    'Meta+Alt+P',
  ]) {
    await page.keyboard.press(shortcut)
  }
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(await page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.calls)).toBe(
    0,
  )

  await dialog.getByRole('button', { name: 'Usage terms', exact: true }).focus()
  await page.keyboard.press('Enter')
  const legalText = dialog.locator('pre')
  await expect(legalText).toContainText('Folden')
  expect((await legalText.textContent())!.trim().length).toBeGreaterThan(300)
  await expect(dialog.locator('details')).toHaveAttribute('open', '')

  await dialog.getByRole('button', { name: 'Close', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await expect(page.getByTestId('open-documents-status')).toHaveText(status!)
  await expect(page.locator('.find-panel')).toHaveCount(0)
})

test('retains a resolved Mac-style print snapshot until the next request or afterprint', async ({
  page,
}) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: { 'print.md': '# Print snapshot\n\nFirst request.' },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-print.md').click()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await installPromisePrinter(page)
  const printButton = page.getByRole('button', {
    name: 'Print / PDF',
    exact: true,
  })
  await printButton.click()
  await expect
    .poll(() => page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.calls))
    .toBe(1)
  await expect(printButton).toBeDisabled()
  await page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.resolve())
  await expect(printButton).toBeEnabled()
  await expect(page.locator('.folden-print-view')).toContainText('First request.')

  await sourceEditor(page).click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await page.keyboard.insertText('\n\nSecond request includes this edit.')
  await expect(page.locator('.folden-print-view')).not.toContainText('Second request')
  // macOS Option changes the key character while preserving the physical key code.
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'π',
        code: 'KeyP',
        metaKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  await expect
    .poll(() => page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.calls))
    .toBe(2)
  await expect(page.locator('.folden-print-view')).toHaveCount(1)
  await expect(page.locator('.folden-print-view')).toContainText(
    'Second request includes this edit.',
  )
  await page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.resolve())
  await expect(printButton).toBeEnabled()
  await expect(page.locator('.folden-print-view')).toHaveCount(1)
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.folden-print-view')).toHaveCount(0)
  await expect(sourceEditor(page)).toContainText('Second request includes this edit.')
})

test('reports a rejected print Promise and permits a successful retry', async ({ page }) => {
  await openApp(page, {
    mockOptions: {
      initialFiles: {
        'print.md': '# Retry printing\n\nKeep the document intact.',
      },
    },
  })
  await page.getByTestId('open-folder-empty').click()
  await page.getByTestId('workspace-entry-print.md').click()
  await installPromisePrinter(page)
  const printButton = page.getByRole('button', {
    name: 'Print / PDF',
    exact: true,
  })
  await printButton.click()
  await expect
    .poll(() => page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.calls))
    .toBe(1)
  await page.evaluate(() =>
    (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.reject('Printer permission denied'),
  )
  await expect(page.locator('.error-message')).toContainText('Printer permission denied')
  await expect(page.locator('.folden-print-view')).toHaveCount(0)
  await expect(printButton).toBeEnabled()
  await printButton.click()
  await expect
    .poll(() => page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.calls))
    .toBe(2)
  await expect(page.locator('.folden-print-view')).toContainText('Keep the document intact.')
  await page.evaluate(() => (window as PrintProbeWindow).__PUBLIC_BETA_PRINT__.resolve())
  await expect(printButton).toBeEnabled()
  await expect(page.locator('.folden-print-view')).toHaveCount(1)
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('.folden-print-view')).toHaveCount(0)
  await expect(page.getByTestId('visual-editor')).toContainText('Keep the document intact.')
})
