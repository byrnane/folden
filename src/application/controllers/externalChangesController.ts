import { ref } from 'vue'

export function createExternalChangesController() {
  const watcherWarning = ref<string | null>(null)
  const pendingWorkspaceRefreshes = new Map<string, number>()
  const pendingDocumentReloads = new Map<string, number>()
  let fsEventUnlisten: (() => void) | null = null
  let watcherWarningUnlisten: (() => void) | null = null

  function setFsEventUnlisten(unlisten: () => void) {
    fsEventUnlisten = unlisten
  }

  function setWatcherWarningUnlisten(unlisten: () => void) {
    watcherWarningUnlisten = unlisten
  }

  function scheduleWorkspaceRefresh(key: string, refresh: () => void) {
    const existingTimeout = pendingWorkspaceRefreshes.get(key)

    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      pendingWorkspaceRefreshes.delete(key)
      refresh()
    }, 180)

    pendingWorkspaceRefreshes.set(key, timeoutId)
  }

  function scheduleDocumentReload(documentId: string, reload: () => void) {
    const existingTimeout = pendingDocumentReloads.get(documentId)

    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      pendingDocumentReloads.delete(documentId)
      reload()
    }, 180)

    pendingDocumentReloads.set(documentId, timeoutId)
  }

  function dispose() {
    fsEventUnlisten?.()
    watcherWarningUnlisten?.()

    for (const timeoutId of pendingWorkspaceRefreshes.values()) {
      window.clearTimeout(timeoutId)
    }

    for (const timeoutId of pendingDocumentReloads.values()) {
      window.clearTimeout(timeoutId)
    }

    pendingWorkspaceRefreshes.clear()
    pendingDocumentReloads.clear()
  }

  return {
    watcherWarning,
    setFsEventUnlisten,
    setWatcherWarningUnlisten,
    scheduleWorkspaceRefresh,
    scheduleDocumentReload,
    dispose,
  }
}
