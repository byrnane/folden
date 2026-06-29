import type { Page } from '@playwright/test'

export async function installTauriMock(page: Page) {
  await page.evaluate(() => {
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
    const callbacks = new Map<number, (data: unknown) => unknown>()
    let nextCallbackId = 1
    let nextDocumentId = 1
    let modifiedAtMs = 1_800_000_000_000

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

    async function invoke(cmd: string, args?: Record<string, unknown>) {
      switch (cmd) {
        case 'open_workspace_directory':
        case 'restore_workspace_by_path':
          return workspace
        case 'list_directory':
          return args?.path === 'notes' ? listRoot()[1].children : listRoot()
        case 'open_text_file_by_path':
          return openedDocument(String(args?.path ?? 'README.md'))
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
          return { entries: [], diagnostics: [] }
        case 'save_session_state':
        case 'save_recovery_snapshots':
        case 'close_native_documents':
        case 'log_frontend_event':
        case 'open_logs_folder':
        case 'plugin:event|unlisten':
        case 'plugin:window|close':
          return undefined
        case 'plugin:event|listen':
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
    })
  })
}
