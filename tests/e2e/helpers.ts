import { expect, type Locator, type Page } from '@playwright/test'
import {
  applicationLayoutStorageKey,
  applicationSettingsStorageKey,
} from '../../src/infrastructure/settings/settings'
import { applicationSettingLimits, layoutSettingLimits } from '../../src/application/settings'
import { documentDragMimeType } from '../../src/ui/documentDrag'
import { installTauriMock } from './tauriMock'

export {
  applicationLayoutStorageKey,
  applicationSettingLimits,
  applicationSettingsStorageKey,
  documentDragMimeType,
  layoutSettingLimits,
}

type OpenAppOptions = {
  mockOptions?: Parameters<typeof installTauriMock>[1]
  storageEntries?: Record<string, string>
}

export async function openApp(page: Page, options: OpenAppOptions = {}) {
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

export function sourceEditor(host: Page | Locator) {
  return host.getByTestId('source-editor').locator('.cm-content')
}

export async function dragBy(locator: Locator, deltaX: number) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()

  await locator.page().mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await locator.page().mouse.down()
  await locator
    .page()
    .mouse.move(box!.x + box!.width / 2 + deltaX, box!.y + box!.height / 2, { steps: 8 })
  await locator.page().mouse.up()
}

export async function readPersistedLayout(page: Page) {
  return page.evaluate((storageKey) => {
    const value = window.localStorage.getItem(storageKey)
    return value ? (JSON.parse(value) as Record<string, unknown>) : null
  }, applicationLayoutStorageKey)
}
