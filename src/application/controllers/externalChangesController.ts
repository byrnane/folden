import { t } from '../i18n'
import { formatError } from '../helpers/errorHelpers'
import { readonly, ref } from 'vue'
import { isDocumentDirty } from '../../domain/document'
import type { OpenDocument } from '../../domain/documents/documentState'
import type { NativeFsEvent } from '../../domain/native'

export const externalFileEventDebounceMs = 180

export function createExternalChangesController() {
  const watcherWarning = ref<string | null>(null)
  const pendingWorkspaceRefreshes = new Map<string, ReturnType<typeof globalThis.setTimeout>>()
  const pendingDocumentReloads = new Map<string, ReturnType<typeof globalThis.setTimeout>>()

  function setWatcherWarning(message: string | null) {
    watcherWarning.value = message === null ? null : formatError(message)
  }

  function scheduleWorkspaceRefresh(key: string, refresh: () => void) {
    const existingTimeout = pendingWorkspaceRefreshes.get(key)

    if (existingTimeout !== undefined) {
      globalThis.clearTimeout(existingTimeout)
    }

    const timeoutId = globalThis.setTimeout(() => {
      pendingWorkspaceRefreshes.delete(key)
      refresh()
    }, externalFileEventDebounceMs)

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
    }, externalFileEventDebounceMs)

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
      routes.markDocumentMissing(
        document.id,
        t('{name} was moved or deleted outside Folden.', { name: document.name }),
      )
      return
    }

    if (isDocumentDirty(document)) {
      routes.markDocumentConflict(
        document.id,
        t('{name} changed on disk while you have unsaved edits.', { name: document.name }),
      )
      return
    }

    routes.clearDocumentExternalState(document.id)
    routes.scheduleDocumentReload(document.id)
  }

  function dispose() {
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
    scheduleWorkspaceRefresh,
    scheduleDocumentReload,
    handleExternalFileEvent,
    dispose,
  }
}
