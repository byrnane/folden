import type { Page } from '@playwright/test'

type RecoverySnapshotMock = {
  key: string
  kind: 'saved' | 'scratch'
  path: string | null
  workspaceRootPath: string | null
  relativePath: string | null
  name: string
  content: string
  fileFormat: {
    lineEnding: string
    hasUtf8Bom: boolean
  }
  fingerprint: {
    size: number
    modifiedAtMs: number
  } | null
  updatedAtMs: number
}

type TauriMockOptions = {
  recoveryEntries?: RecoverySnapshotMock[]
}

export async function installTauriMock(page: Page, options: TauriMockOptions = {}) {
  await page.addInitScript((mockOptions: TauriMockOptions) => {
    type WorkspaceEntry = {
      name: string
      path: string
      kind: 'directory' | 'file'
      children: WorkspaceEntry[]
    }

    type OpenedDocument = {
      id: string
      path: string
      content: string
      workspaceId: string | null
      relativePath: string | null
      fileFormat: {
        lineEnding: string
        hasUtf8Bom: boolean
      }
      fingerprint: {
        size: number
        modifiedAtMs: number
      } | null
    }

    const workspace = {
      id: 'workspace-folden-e2e',
      rootPath: 'C:\\FoldenE2E',
      name: 'FoldenE2E',
    }
    const files = new Map<string, string>([
      ['README.md', '# E2E Note\r\n\r\nOriginal content.\r\n'],
      ['notes\\daily.md', '# Daily\n\nNested note.\n'],
    ])
    let recoveryEntries = [...(mockOptions.recoveryEntries ?? [])]
    const callbacks = new Map<number, (data: unknown) => unknown>()
    const eventListeners = new Map<string, Set<number>>()
    let nextCallbackId = 1
    let nextDocumentId = 1
    let modifiedAtMs = 1_800_000_000_000
    let windowDestroyed = false
    let diagnosticExportCount = 0

    function fingerprint(content: string) {
      modifiedAtMs += 1
      return {
        size: content.length,
        modifiedAtMs,
      }
    }

    function openedDocument(relativePath: string): OpenedDocument {
      const content = files.get(relativePath)

      if (content === undefined) {
        throw {
          code: 'not_found',
          operation: 'open_text_file_by_path',
          userMessage: 'Path was not found.',
          technicalMessage: relativePath,
          retryable: true,
        }
      }

      return {
        id: `native-doc-${nextDocumentId++}`,
        path: `${workspace.rootPath}\\${relativePath}`,
        content,
        workspaceId: workspace.id,
        relativePath,
        fileFormat: {
          lineEnding: 'lf',
          hasUtf8Bom: false,
        },
        fingerprint: fingerprint(content),
      }
    }

    function listRoot(): WorkspaceEntry[] {
      return [
        {
          name: '.cache',
          path: '.cache',
          kind: 'directory',
          children: [
            {
              name: 'hidden.md',
              path: '.cache\\hidden.md',
              kind: 'file',
              children: [],
            },
          ],
        },
        {
          name: 'README.md',
          path: 'README.md',
          kind: 'file',
          children: [],
        },
        {
          name: 'notes',
          path: 'notes',
          kind: 'directory',
          children: [
            {
              name: 'daily.md',
              path: 'notes\\daily.md',
              kind: 'file',
              children: [],
            },
          ],
        },
      ]
    }

    function normalizeRelativePath(path: string) {
      const normalizedPath = path.replaceAll('/', '\\')

      if (normalizedPath === workspace.rootPath) {
        return ''
      }

      const rootPrefix = `${workspace.rootPath}\\`
      return normalizedPath.startsWith(rootPrefix)
        ? normalizedPath.slice(rootPrefix.length)
        : normalizedPath
    }

    function findDirectoryEntries(path: string) {
      const targetPath = normalizeRelativePath(path)

      if (!targetPath) {
        return listRoot()
      }

      const stack = [...listRoot()]

      while (stack.length > 0) {
        const current = stack.shift()

        if (!current || current.kind !== 'directory') {
          continue
        }

        if (current.path === targetPath) {
          return current.children
        }

        stack.unshift(...current.children)
      }

      return []
    }

    function emitFsEvent(kind: 'create' | 'modify' | 'remove', absolutePath: string) {
      const listeners = eventListeners.get('folden://fs-event')
      if (!listeners) {
        return
      }

      const payload = {
        kind,
        path: absolutePath,
      }

      for (const id of listeners) {
        callbacks.get(id)?.({ event: 'folden://fs-event', payload })
      }
    }

    async function invoke(cmd: string, args?: Record<string, unknown>) {
      switch (cmd) {
        case 'open_workspace_directory':
        case 'restore_workspace_by_path':
          return workspace
        case 'list_directory':
          return findDirectoryEntries(String(args?.path ?? ''))
        case 'open_text_file_by_path':
        case 'open_text_file_at_path':
          return openedDocument(normalizeRelativePath(String(args?.path ?? 'README.md')))
        case 'save_text_file': {
          const content = String(args?.content ?? '')
          const documentId = typeof args?.documentId === 'string' ? args.documentId : null
          const relativePath = documentId ? 'README.md' : String(args?.suggestedFileName ?? 'Untitled.md')

          files.set(relativePath, content)

          return {
            id: documentId ?? `native-doc-${nextDocumentId++}`,
            path: `${workspace.rootPath}\\${relativePath}`,
            content,
            workspaceId: workspace.id,
            relativePath,
            fileFormat: args?.fileFormat ?? {
              lineEnding: 'lf',
              hasUtf8Bom: false,
            },
            fingerprint: fingerprint(content),
          }
        }
        case 'load_session_state':
          return null
        case 'load_recovery_snapshots':
          return {
            entries: recoveryEntries.map((entry) => structuredClone(entry)),
            diagnostics: [],
          }
        case 'save_session_state':
        case 'save_recovery_snapshots':
        case 'close_native_documents':
        case 'log_frontend_event':
        case 'open_logs_folder':
        case 'plugin:event|unlisten':
          if (typeof args?.event === 'string' && typeof args?.eventId === 'number') {
            eventListeners.get(args.event)?.delete(args.eventId)
          }
          return undefined
        case 'plugin:window|close':
          return undefined
        case 'plugin:window|destroy':
          windowDestroyed = true
          return undefined
        case 'export_diagnostics':
          diagnosticExportCount += 1
          return 'C:\\FoldenAppData\\folden-diagnostics.txt'
        case 'plugin:event|listen':
          if (typeof args?.event === 'string' && typeof args?.handler === 'number') {
            const listeners = eventListeners.get(args.event) ?? new Set<number>()
            listeners.add(args.handler)
            eventListeners.set(args.event, listeners)
          }
          return args?.handler
        default:
          throw new Error(`Unhandled Tauri command in E2E mock: ${cmd}`)
      }
    }

    const tauriInternals = {
      callbacks,
      convertFileSrc: (filePath: string, protocol = 'asset') =>
        `http://${protocol}.localhost/${encodeURIComponent(filePath)}`,
      invoke,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      runCallback: (id: number, data: unknown) => callbacks.get(id)?.(data),
      transformCallback: (callback?: (data: unknown) => unknown, once = false) => {
        const id = nextCallbackId++
        callbacks.set(id, (data: unknown) => {
          if (once) {
            callbacks.delete(id)
          }
          return callback?.(data)
        })
        return id
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id)
      },
    }

    Object.assign(window, {
      __TAURI_INTERNALS__: tauriInternals,
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: (_event: string, id: number) => {
          callbacks.delete(id)
        },
      },
      __FOLDEN_TAURI_MOCK__: {
        async requestWindowClose() {
          const listeners = eventListeners.get('tauri://close-requested') ?? new Set<number>()

          for (const id of listeners) {
            void callbacks.get(id)?.({ event: 'tauri://close-requested', id })
          }
        },
        isWindowDestroyed() {
          return windowDestroyed
        },
        getDiagnosticExportCount() {
          return diagnosticExportCount
        },
        emitFsChange(relativePath: string, content: string) {
          files.set(relativePath, content)
          emitFsEvent('modify', `${workspace.rootPath}\\${relativePath}`)
        },
        readFile(relativePath: string) {
          return files.get(relativePath) ?? null
        },
        setRecoveryEntries(entries: RecoverySnapshotMock[]) {
          recoveryEntries = [...entries]
        },
      },
    })
  }, options)
}
