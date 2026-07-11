import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createLayoutController } from '../../../../src/application/controllers/layoutController'
import {
  defaultApplicationSettings,
  defaultLayoutSettings,
  layoutSettingLimits,
} from '../../../../src/application/settings'

function createController() {
  const appSettings = ref(structuredClone(defaultApplicationSettings))
  const saveLayoutSettings = vi.fn()
  const controller = createLayoutController({
    appSettings,
    loadLayoutSettings: () => structuredClone(defaultLayoutSettings),
    saveLayoutSettings,
  })

  return { appSettings, controller, saveLayoutSettings }
}

describe('layout controller', () => {
  it('clamps resizable layout values', () => {
    const { controller } = createController()

    controller.setSidebarWidth(0)
    controller.setSplitRatio(1)
    controller.setOutlineWidth(999)
    controller.setDocumentMapWidth(0)

    expect(controller.layoutSettings.value).toMatchObject({
      sidebarWidth: layoutSettingLimits.sidebarWidth.min,
      splitRatio: layoutSettingLimits.splitRatio.max,
      outlineWidth: layoutSettingLimits.outlineWidth.max,
      documentMapWidth: layoutSettingLimits.documentMapWidth.min,
    })
    controller.dispose()
  })

  it('owns activity navigation and sidebar visibility', () => {
    const { appSettings, controller } = createController()

    controller.setActivitySection('search')
    expect(appSettings.value.appearance.showSidebar).toBe(true)
    controller.closeSidebar()
    expect(appSettings.value.appearance.showSidebar).toBe(false)

    controller.setActivitySection('settings')
    controller.closeSidebar()
    expect(appSettings.value.appearance.showSidebar).toBe(false)
    controller.dispose()
  })

  it('toggles navigation chrome and restores layout defaults', () => {
    const { appSettings, controller } = createController()

    controller.toggleDocumentOutline()
    controller.toggleDocumentMap()
    controller.toggleFocusMode()
    appSettings.value.appearance.showActivityBar = false
    appSettings.value.appearance.showSidebar = false
    appSettings.value.appearance.showStatusBar = false
    controller.resetLayoutSettings()

    expect(controller.layoutSettings.value).toEqual(defaultLayoutSettings)
    expect(appSettings.value.appearance).toMatchObject({
      showActivityBar: true,
      showSidebar: true,
      showStatusBar: true,
    })
    controller.dispose()
  })

  it('persists changes and stops persistence on disposal', async () => {
    const { controller, saveLayoutSettings } = createController()

    controller.setActivityRailMode('expanded')
    controller.setActivityRailWidth(200)
    await nextTick()

    expect(saveLayoutSettings).toHaveBeenCalledTimes(1)
    expect(saveLayoutSettings).toHaveBeenLastCalledWith(controller.layoutSettings.value)

    controller.dispose()
    controller.setActivityRailWidth(220)
    await nextTick()
    expect(saveLayoutSettings).toHaveBeenCalledTimes(1)
  })
})
