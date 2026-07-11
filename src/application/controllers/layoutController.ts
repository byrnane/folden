import { ref, watch, type Ref } from 'vue'
import {
  defaultLayoutSettings,
  layoutSettingLimits,
  type ActivityRailMode,
  type ActivitySection,
  type ApplicationSettings,
  type LayoutSettings,
} from '../settings'

type LayoutControllerOptions = {
  appSettings: Ref<ApplicationSettings>
  loadLayoutSettings: () => LayoutSettings
  saveLayoutSettings: (settings: LayoutSettings) => void
}

function clamp(value: number, limit: { min: number; max: number }) {
  return Math.min(Math.max(value, limit.min), limit.max)
}

export function createLayoutController(options: LayoutControllerOptions) {
  const layoutSettings = ref(options.loadLayoutSettings())
  const stopPersistence = watch(
    layoutSettings,
    (settings) => options.saveLayoutSettings(settings),
    { deep: true },
  )

  function setActivitySection(section: ActivitySection) {
    layoutSettings.value.activeActivitySection = section
    if (section !== 'settings') {
      options.appSettings.value.appearance.showSidebar = true
    }
  }

  function closeSidebar() {
    if (layoutSettings.value.activeActivitySection !== 'settings') {
      options.appSettings.value.appearance.showSidebar = false
    }
  }

  function setActivityRailMode(mode: ActivityRailMode) {
    layoutSettings.value.activityRailMode = mode
  }

  function resetLayoutSettings() {
    layoutSettings.value = structuredClone(defaultLayoutSettings)
    options.appSettings.value.appearance.showActivityBar = true
    options.appSettings.value.appearance.showSidebar = true
    options.appSettings.value.appearance.showStatusBar = true
  }

  function setSidebarWidth(width: number) {
    layoutSettings.value.sidebarWidth = clamp(width, layoutSettingLimits.sidebarWidth)
  }

  function setActivityRailWidth(width: number) {
    if (layoutSettings.value.activityRailMode === 'expanded') {
      layoutSettings.value.activityExpandedWidth = clamp(
        width,
        layoutSettingLimits.activityExpandedWidth,
      )
      return
    }

    layoutSettings.value.activityCompactWidth = clamp(
      width,
      layoutSettingLimits.activityCompactWidth,
    )
  }

  function resetActivityRailWidth() {
    if (layoutSettings.value.activityRailMode === 'expanded') {
      layoutSettings.value.activityExpandedWidth = defaultLayoutSettings.activityExpandedWidth
      return
    }

    layoutSettings.value.activityCompactWidth = defaultLayoutSettings.activityCompactWidth
  }

  function setSplitRatio(ratio: number) {
    layoutSettings.value.splitRatio = clamp(ratio, layoutSettingLimits.splitRatio)
  }

  function setOutlineWidth(width: number) {
    layoutSettings.value.outlineWidth = clamp(width, layoutSettingLimits.outlineWidth)
  }

  function setDocumentMapWidth(width: number) {
    layoutSettings.value.documentMapWidth = clamp(width, layoutSettingLimits.documentMapWidth)
  }

  function toggleDocumentOutline() {
    layoutSettings.value.showDocumentOutline = !layoutSettings.value.showDocumentOutline
  }

  function toggleDocumentMap() {
    layoutSettings.value.showDocumentMap = !layoutSettings.value.showDocumentMap
  }

  function toggleFocusMode() {
    layoutSettings.value.focusMode = !layoutSettings.value.focusMode
  }

  return {
    layoutSettings,
    setActivitySection,
    closeSidebar,
    setActivityRailMode,
    resetLayoutSettings,
    setSidebarWidth,
    setActivityRailWidth,
    resetActivityRailWidth,
    setSplitRatio,
    setOutlineWidth,
    setDocumentMapWidth,
    toggleDocumentOutline,
    toggleDocumentMap,
    toggleFocusMode,
    dispose: stopPersistence,
  }
}
