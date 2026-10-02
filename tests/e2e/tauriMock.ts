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
  initialFiles?: Record<string, string>
  unsupportedFiles?: string[]
  recoveryEntries?: RecoverySnapshotMock[]
  persistAcrossReload?: boolean
}

export async function installTauriMock(page: Page, options: TauriMockOptions = {}) {
  if (options.persistAcrossReload) {
    await page.route('http://asset.localhost/**', async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)).replace(
        /^C:\\FoldenE2E\\/u,
        '',
      )
      const bytes = await page.evaluate(
        (relativePath) =>
          (
            window as Window & {
              __FOLDEN_TAURI_MOCK__?: { readImage(path: string): number[] | null }
            }
          ).__FOLDEN_TAURI_MOCK__?.readImage(relativePath),
        path,
      )
      if (bytes)
        await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(bytes) })
      else await route.abort('failed')
    })
  }
  await page.addInitScript((mockOptions: TauriMockOptions) => {
    type WorkspaceEntry = {
      name: string
      path: string
      kind: 'directory' | 'file'
      openableState: 'unknown' | 'present' | 'empty'
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
      ...Object.entries(mockOptions.initialFiles ?? {}).map(
        ([path, content]) => [path.replaceAll('/', '\\'), content] as const,
      ),
    ])
    let recoveryEntries = [...(mockOptions.recoveryEntries ?? [])]
    const callbacks = new Map<number, (data: unknown) => unknown>()
    const eventListeners = new Map<string, Set<number>>()
    let nextCallbackId = 1
    let nextDocumentId = 1
    let modifiedAtMs = 1_800_000_000_000
    let windowDestroyed = false
    let diagnosticExportCount = 0
    const nativeDocumentPaths = new Map<string, string>()
    const explicitDirectories = new Set<string>()
    const imagePaths = new Map<string, number[]>()
    const cancelledScans = new Set<string>()
    let workspaceSettings = { ignoredPaths: [] as string[] }
    const unsupportedFiles = new Set(
      (mockOptions.unsupportedFiles ?? []).map((path) => path.replaceAll('/', '\\')),
    )
    let sessionState: unknown = null
    const persistedKey = 'folden-e2e-native'
    if (mockOptions.persistAcrossReload) {
      const saved = sessionStorage.getItem(persistedKey)
      if (saved) {
        const state = JSON.parse(saved) as {
          files: [string, string][]
          directories: string[]
          images: [string, number[]][]
          recovery: RecoverySnapshotMock[]
          settings: typeof workspaceSettings
          session: unknown
          modifiedAtMs: number
        }
        files.clear()
        for (const [path, content] of state.files) files.set(path, content)
        for (const path of state.directories) explicitDirectories.add(path)
        for (const [path, bytes] of state.images) imagePaths.set(path, bytes)
        recoveryEntries = state.recovery
        workspaceSettings = state.settings
        sessionState = state.session
        modifiedAtMs = state.modifiedAtMs
      }
    }
    function persistMockState() {
      if (!mockOptions.persistAcrossReload) return
      sessionStorage.setItem(
        persistedKey,
        JSON.stringify({
          files: [...files],
          directories: [...explicitDirectories],
          images: [...imagePaths],
          recovery: recoveryEntries,
          settings: workspaceSettings,
          session: sessionState,
          modifiedAtMs,
        }),
      )
    }

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

      const id = `native-doc-${nextDocumentId++}`
      nativeDocumentPaths.set(id, relativePath)

      return {
        id,
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

    function basename(path: string) {
      return path.split('\\').at(-1) ?? path
    }

    function dirname(path: string) {
      const index = path.lastIndexOf('\\')
      return index === -1 ? '' : path.slice(0, index)
    }

    function directoryEntry(path: string): WorkspaceEntry {
      return {
        name: basename(path),
        path,
        kind: 'directory',
        openableState: 'unknown',
        children: [],
      }
    }

    function fileEntry(path: string): WorkspaceEntry {
      return {
        name: basename(path),
        path,
        kind: 'file',
        openableState: 'present',
        children: [],
      }
    }

    function sortEntries(entries: WorkspaceEntry[]) {
      entries.sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'directory' ? -1 : 1
        }

        return left.name.localeCompare(right.name)
      })

      for (const entry of entries) {
        sortEntries(entry.children)
      }
    }

    function listRoot(): WorkspaceEntry[] {
      const directories = new Map<string, WorkspaceEntry>()
      const rootEntries: WorkspaceEntry[] = []

      function ensureDirectory(path: string) {
        if (!path) {
          return null
        }

        const existing = directories.get(path)
        if (existing) {
          return existing
        }

        const entry = directoryEntry(path)
        directories.set(path, entry)
        const parent = ensureDirectory(dirname(path))
        if (parent) {
          parent.children.push(entry)
        } else {
          rootEntries.push(entry)
        }
        return entry
      }

      function addOpenableFile(path: string) {
        const parent = ensureDirectory(dirname(path))
        const entry = fileEntry(path)
        if (parent) {
          parent.children.push(entry)
        } else {
          rootEntries.push(entry)
        }
      }

      for (const path of files.keys()) {
        addOpenableFile(path)
      }
      for (const path of explicitDirectories) ensureDirectory(path)

      for (const path of unsupportedFiles) {
        ensureDirectory(dirname(path))
      }
      for (const path of imagePaths.keys()) ensureDirectory(dirname(path))

      const markOpenable = (entry: WorkspaceEntry): boolean => {
        const present = entry.children.some((child) => child.kind === 'file' || markOpenable(child))
        entry.openableState = present ? 'present' : entry.children.length ? 'unknown' : 'empty'
        return present
      }

      for (const entry of rootEntries) {
        markOpenable(entry)
      }
      sortEntries(rootEntries)
      return rootEntries
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
      const shallowEntries = (entries: WorkspaceEntry[]) =>
        entries.map((entry) => ({
          ...entry,
          openableState: entry.kind === 'directory' ? ('unknown' as const) : ('present' as const),
          children: [],
        }))

      if (!targetPath) {
        return shallowEntries(listRoot())
      }

      const stack = [...listRoot()]

      while (stack.length > 0) {
        const current = stack.shift()

        if (!current || current.kind !== 'directory') {
          continue
        }

        if (current.path === targetPath) {
          return shallowEntries(current.children)
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

    function emitNativeEvent(event: string, payload: unknown) {
      for (const id of eventListeners.get(event) ?? []) callbacks.get(id)?.({ event, payload })
    }

    function scanPaths(request: Record<string, unknown>) {
      const ignoredNames = new Set(
        [
          '.git',
          '.folden',
          'node_modules',
          'dist',
          'build',
          'target',
          '.cache',
          ...(Array.isArray(request.ignoredNames) ? request.ignoredNames.map(String) : []),
        ].map((name) => name.toLowerCase()),
      )
      const ignoredPaths = [
        ...(Array.isArray(request.ignoredPaths) ? request.ignoredPaths.map(String) : []),
        ...(Array.isArray(request.excludedPaths) ? request.excludedPaths.map(String) : []),
      ].map((path) => normalizeRelativePath(path).toLowerCase())
      return [...files.keys()]
        .filter((path) => {
          const key = path.toLowerCase()
          return (
            /\.(md|markdown|txt|json|toml|rs|ts|js|vue|css|html|yml|yaml)$/iu.test(path) &&
            !path.split('\\').some((part) => ignoredNames.has(part.toLowerCase())) &&
            !ignoredPaths.some((ignored) => key === ignored || key.startsWith(`${ignored}\\`))
          )
        })
        .sort((left, right) => left.localeCompare(right))
    }

    function moveMockPath(path: string, nextPath: string) {
      if (
        files.has(nextPath) ||
        explicitDirectories.has(nextPath) ||
        [...files.keys(), ...imagePaths.keys()].some(
          (entry) => entry === nextPath || entry.startsWith(`${nextPath}\\`),
        )
      ) {
        throw {
          code: 'already_exists',
          operation: 'move_path',
          userMessage: 'Target already exists.',
          technicalMessage: null,
          retryable: false,
        }
      }
      for (const [current, content] of [...files.entries()]) {
        if (current === path || current.startsWith(`${path}\\`)) {
          files.delete(current)
          files.set(`${nextPath}${current.slice(path.length)}`, content)
        }
      }
      for (const [id, current] of nativeDocumentPaths) {
        if (current === path || current.startsWith(`${path}\\`))
          nativeDocumentPaths.set(id, `${nextPath}${current.slice(path.length)}`)
      }
      for (const [current, bytes] of [...imagePaths.entries()]) {
        if (current === path || current.startsWith(`${path}\\`)) {
          imagePaths.delete(current)
          imagePaths.set(`${nextPath}${current.slice(path.length)}`, bytes)
        }
      }
      for (const current of [...explicitDirectories]) {
        if (current === path || current.startsWith(`${path}\\`)) {
          explicitDirectories.delete(current)
          explicitDirectories.add(`${nextPath}${current.slice(path.length)}`)
        }
      }
      return nextPath
    }

    function importMockImage(
      documentId: string,
      bytes: number[],
      mime: string,
      name = 'image.png',
    ) {
      const documentPath = nativeDocumentPaths.get(documentId)
      if (!documentPath) throw new Error('Save the document before importing an image.')
      const extension = (
        {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/gif': 'gif',
          'image/webp': 'webp',
        } as Record<string, string>
      )[mime]
      if (!extension) throw new Error('Choose a PNG, JPEG, GIF, or WebP image.')
      const folder = `${basename(documentPath).replace(/\.[^.]+$/u, '')}.assets`
      const stem = basename(name).replace(/\.[^.]+$/u, '')
      let fileName = `${stem}.${extension}`
      let suffix = 2
      let target = [dirname(documentPath), folder, fileName].filter(Boolean).join('\\')
      while (imagePaths.has(target)) {
        fileName = `${stem}-${suffix++}.${extension}`
        target = [dirname(documentPath), folder, fileName].filter(Boolean).join('\\')
      }
      imagePaths.set(target, [...bytes])
      return `${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`
    }

    async function invoke(cmd: string, args?: Record<string, unknown>) {
      switch (cmd) {
        case 'open_workspace_directory':
        case 'restore_workspace_by_path':
          return workspace
        case 'list_directory':
          return findDirectoryEntries(String(args?.path ?? ''))
        case 'sync_workspace_watch_scope':
          return undefined
        case 'cancel_workspace_search':
          cancelledScans.add(`${String(args?.workspaceId)}:${String(args?.requestId)}`)
          return undefined
        case 'list_workspace_files': {
          const request = (args?.request ?? {}) as Record<string, unknown>
          const paths = scanPaths(request)
          return {
            files: paths.slice(0, 100_000),
            partial: paths.length > 100_000,
            skipped: 0,
            cancelled: false,
          }
        }
        case 'start_workspace_search': {
          const request = (args?.request ?? {}) as Record<string, unknown>
          const query = String(request.query ?? '')
          const sensitive = Boolean(request.caseSensitive)
          const matches: {
            path: string
            from: number
            to: number
            line: number
            column: number
            preview: string
            fingerprint: { size: number; modifiedAtMs: number }
          }[] = []
          let skipped = 0
          if (query)
            for (const path of scanPaths(request)) {
              const content = files.get(path) ?? ''
              if (
                new TextEncoder().encode(content).length > 2 * 1024 * 1024 ||
                content.includes('\0')
              ) {
                skipped += 1
                continue
              }
              const haystack = sensitive ? content : content.toLowerCase()
              const needle = sensitive ? query : query.toLowerCase()
              let from = haystack.indexOf(needle)
              while (from !== -1 && matches.length < 5_000) {
                const before = content.slice(0, from)
                const start = before.lastIndexOf('\n') + 1
                const end = content.indexOf('\n', from)
                matches.push({
                  path,
                  from,
                  to: from + needle.length,
                  line: before.split('\n').length,
                  column: from - start + 1,
                  preview: content.slice(start, end < 0 ? undefined : end).replace(/\r$/u, ''),
                  fingerprint: { size: content.length, modifiedAtMs },
                })
                from = haystack.indexOf(needle, from + needle.length)
              }
              if (matches.length >= 5_000) break
            }
          const cancelled = cancelledScans.has(
            `${String(request.workspaceId)}:${String(request.requestId)}`,
          )
          if (!cancelled)
            for (let index = 0; index < matches.length; index += 100) {
              emitNativeEvent('folden://workspace-search-batch', {
                workspaceId: request.workspaceId,
                requestId: request.requestId,
                matches: matches.slice(index, index + 100),
              })
            }
          return {
            matches: cancelled ? [] : matches,
            partial: matches.length >= 5_000,
            skipped,
            cancelled,
          }
        }
        case 'create_file': {
          const path = [String(args?.parentPath ?? ''), String(args?.name ?? '')]
            .filter(Boolean)
            .join('\\')
          if (files.has(path)) throw new Error('File already exists.')
          files.set(path, '')
          return path
        }
        case 'create_directory': {
          const path = [String(args?.parentPath ?? ''), String(args?.name ?? '')]
            .filter(Boolean)
            .join('\\')
          explicitDirectories.add(path)
          return path
        }
        case 'rename_path': {
          const path = normalizeRelativePath(String(args?.path ?? ''))
          return moveMockPath(
            path,
            [dirname(path), String(args?.newName ?? '')].filter(Boolean).join('\\'),
          )
        }
        case 'move_path': {
          const path = normalizeRelativePath(String(args?.path ?? ''))
          const parent = normalizeRelativePath(String(args?.targetParent ?? ''))
          if (!path || parent === path || parent.startsWith(`${path}\\`))
            throw new Error('Invalid target folder.')
          const target = [parent, basename(path)].filter(Boolean).join('\\')
          if (target === path) return path
          const assetsName = `${basename(path).replace(/\.[^.]+$/u, '')}.assets`
          const assets = [dirname(path), assetsName].filter(Boolean).join('\\')
          const targetAssets = [parent, assetsName].filter(Boolean).join('\\')
          const moveAssets =
            files.has(path) &&
            /\.(md|markdown)$/iu.test(path) &&
            (explicitDirectories.has(assets) ||
              [...imagePaths.keys()].some((image) => image.startsWith(`${assets}\\`)))
          if (
            moveAssets &&
            (explicitDirectories.has(targetAssets) ||
              [...files.keys(), ...imagePaths.keys()].some(
                (entry) => entry === targetAssets || entry.startsWith(`${targetAssets}\\`),
              ))
          )
            throw new Error('The target folder already contains assets for this document.')
          moveMockPath(path, target)
          if (moveAssets) moveMockPath(assets, targetAssets)
          return target
        }
        case 'trash_path': {
          const path = normalizeRelativePath(String(args?.path ?? ''))
          for (const current of [...files.keys()])
            if (current === path || current.startsWith(`${path}\\`)) files.delete(current)
          for (const current of [...explicitDirectories])
            if (current === path || current.startsWith(`${path}\\`))
              explicitDirectories.delete(current)
          for (const current of [...imagePaths.keys()])
            if (current === path || current.startsWith(`${path}\\`)) imagePaths.delete(current)
          return undefined
        }
        case 'import_image_from_picker':
          return importMockImage(
            String(args?.documentId),
            Array.from(
              atob(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              ),
              (character) => character.charCodeAt(0),
            ),
            'image/png',
            'picture.png',
          )
        case 'import_image_data':
          return importMockImage(
            String(args?.documentId),
            Array.isArray(args?.bytes) ? (args.bytes as number[]) : [],
            String(args?.mime),
            typeof args?.name === 'string' ? args.name : undefined,
          )
        case 'load_workspace_settings':
          return structuredClone(workspaceSettings)
        case 'save_workspace_settings':
          workspaceSettings = {
            ignoredPaths: Array.isArray(
              (args?.settings as typeof workspaceSettings | undefined)?.ignoredPaths,
            )
              ? [...(args!.settings as typeof workspaceSettings).ignoredPaths]
              : [],
          }
          return undefined
        case 'open_text_file_by_path':
        case 'open_text_file_at_path':
          return openedDocument(normalizeRelativePath(String(args?.path ?? 'README.md')))
        case 'save_text_file': {
          const content = String(args?.content ?? '')
          const documentId = typeof args?.documentId === 'string' ? args.documentId : null
          const relativePath = documentId
            ? (nativeDocumentPaths.get(documentId) ?? 'README.md')
            : String(args?.suggestedFileName ?? 'Untitled.md')

          files.set(relativePath, content)
          const nextDocumentIdValue = documentId ?? `native-doc-${nextDocumentId++}`
          nativeDocumentPaths.set(nextDocumentIdValue, relativePath)

          return {
            id: nextDocumentIdValue,
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
          return mockOptions.persistAcrossReload ? structuredClone(sessionState) : null
        case 'load_recovery_snapshots':
          return {
            entries: recoveryEntries.map((entry) => structuredClone(entry)),
            diagnostics: [],
          }
        case 'save_session_state':
          if (mockOptions.persistAcrossReload)
            sessionState = JSON.parse(JSON.stringify(args?.session ?? null))
          return undefined
        case 'save_recovery_snapshots':
          if (mockOptions.persistAcrossReload)
            recoveryEntries = JSON.parse(
              JSON.stringify(args?.entries ?? []),
            ) as RecoverySnapshotMock[]
          return undefined
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
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        const result = await invoke(cmd, args)
        persistMockState()
        return result
      },
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
        readImage(relativePath: string) {
          return imagePaths.get(relativePath) ?? null
        },
        getWorkspaceSettings() {
          return structuredClone(workspaceSettings)
        },
        setRecoveryEntries(entries: RecoverySnapshotMock[]) {
          recoveryEntries = [...entries]
        },
      },
    })
  }, options)
}
