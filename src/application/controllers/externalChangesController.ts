import { readonly, ref } from 'vue'
import { isDocumentDirty } from '../../domain/document'
import type { OpenDocument } from '../../domain/documents/documentState'
import type { NativeFsEvent } from '../../infrastructure/tauri/files'

export function createExternalChangesController() {
  const watcherWarning = ref<string | null>(null)
  const pendingWorkspaceRefreshes = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
  const pendingDocumentReloads = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
  let fsEventUnlisten: (() => void) | null = null
  let watcherWarningUnlisten: (() => void) | null = null

  function setWatcherWarning(message: string | null) {
    watcherWarning.value = message
  }

  function setFsEventUnlisten(unlisten: () => void) {
    fsEventUnlisten = unlisten
  }

  function setWatcherWarningUnlisten(unlisten: () => void) {
    watcherWarningUnlisten = unlisten
  }

  function scheduleWorkspaceRefresh(key: string, refresh: () => void) {
    const existingTimeout = pendingWorkspaceRefreshes.get(key)

    if (existingTimeout !== undefined) {
      globalThis.clearTimeout(existingTimeout)
    }

    const timeoutId = globalThis.setTimeout(() => {
      pendingWorkspaceRefreshes.delete(key)
      refresh()
    }, 180)

    pendingWorkspaceRefreshes.set(key, timeoutId)
  }

  function scheduleDocumentReload(documentId: string, reload: () => void) {
    const existingTimeout = pendingDocumentReloads.get(documentId)

    if (existingTimeout !== undefined) {
      globalThis.clearTimeout(existingTimeout)
    }

    const timeoutId = globalThis.setTimeout(() => {
      pendingDocumentReloads.delete(documentId)
      reload()
    }, 180)

    pendingDocumentReloads.set(documentId, timeoutId)
  }

  function handleExternalFileEvent(
    event: NativeFsEvent,
    routes: {
      findDocumentByPath: (path: string) => OpenDocument | null
      workspaceRelativePathFromAbsolute: (path: string) => string | null
      scheduleWorkspaceRefresh: (relativePath: string) => void
      scheduleDocumentReload: (documentId: string) => void
      markDocumentMissing: (documentId: string, message: string) => void
      markDocumentConflict: (documentId: string, message: string) => void
      clearDocumentExternalState: (documentId: string) => void
    },
  ) {
    const document = routes.findDocumentByPath(event.path)
    const relativePath = routes.workspaceRelativePathFromAbsolute(event.path)

    if (relativePath !== null) {
      routes.scheduleWorkspaceRefresh(relativePath)
    }

    if (!document) {
      return
    }

    if (event.kind === 'remove') {
      routes.markDocumentMissing(document.id, `${document.name} was moved or deleted outside Folden.`)
      return
    }

    if (isDocumentDirty(document)) {
      routes.markDocumentConflict(document.id, `${document.name} changed on disk while you have unsaved edits.`)
      return
    }

    routes.clearDocumentExternalState(document.id)
    routes.scheduleDocumentReload(document.id)
  }

  function dispose() {
    fsEventUnlisten?.()
    watcherWarningUnlisten?.()

    for (const timeoutId of pendingWorkspaceRefreshes.values()) {
      globalThis.clearTimeout(timeoutId)
    }

    for (const timeoutId of pendingDocumentReloads.values()) {
      globalThis.clearTimeout(timeoutId)
    }

    pendingWorkspaceRefreshes.clear()
    pendingDocumentReloads.clear()
  }

  return {
    watcherWarning: readonly(watcherWarning),
    setWatcherWarning,
    setFsEventUnlisten,
    setWatcherWarningUnlisten,
    scheduleWorkspaceRefresh,
    scheduleDocumentReload,
    handleExternalFileEvent,
    dispose,
  }
}
