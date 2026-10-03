# Folden Architecture

[Русский](ARCHITECTURE.ru.md) · [Development](DEVELOPMENT.md)

This guide describes the current code and the responsibilities of its main parts.

## Dependency Flow

```text
Vue UI
  ↓
applicationShell and controllers
  ↓
application ports
  ↓
Tauri adapters
  ↓
Rust commands
  ↓
filesystem and operating system
```

The shell connects these parts and exposes state and actions to the UI. Pure document and Markdown rules live in `domain` and can be used by the other layers.

## Frontend Layers

### `src/ui`

Vue views, editors, dialogs, and navigation components. They render state and call the application API. Editor adapters handle Tiptap and CodeMirror interactions. Shared outline and document-map components sit in `navigation/`; the map uses a canvas. Source and Visual editor code loads on demand.

### `src/application`

Controllers coordinate editing, file operations, settings, and application lifecycle. `applicationShell.ts` creates them, injects dependencies, and returns the public API from `useApplicationShell`. Controllers receive native capabilities through `ports/nativePorts.ts`.

`settings/` defines defaults, limits, and normalization. `i18n.ts` translates English interface keys; `systemLanguage.ts` detects the initial language. The chosen language is saved in application settings.

### `src/domain`

Framework-independent TypeScript rules and types: document revisions, shared history, save queues, editor synchronization, Markdown blocks, images, links, search ranges, navigation, conflicts, and native data contracts. This layer has no dependencies on Vue, Tauri, UI components, browser storage, or infrastructure.

The Markdown block model retains unchanged source slices and stable block IDs. Visual editing preserves unsupported syntax in editable source blocks. Shared undo/redo records text patches.

### `src/infrastructure`

`tauri/` implements native ports and local image previews through the asset protocol. `settings/settings.ts` reads and writes browser storage, including migration of old layout settings. Application controllers use these implementations through their contracts.

## State Ownership

Each controller owns its state and provides methods to change it. The shell exposes the refs and computed values needed by the UI.

| Controller                                          | Responsibility                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `documentController`                                | Open documents, revisions, unsaved changes, content, save and external-file states                     |
| `paneController`                                    | Panes, tabs, active pane, editor view sessions, and per-pane document modes                            |
| `workspaceController`                               | Project tree, loaded branches, selection, recent folders, and path remapping                           |
| `sessionController`                                 | Session and recovery snapshots, pending recovery entries, and delayed persistence                      |
| `externalChangesController`                         | File-event routing, watcher warnings, and delayed document/tree refreshes                              |
| `visualSafetyController`                            | Visual-mode safety and remote-image permission for each document                                       |
| `dialogController`                                  | Prompts, confirmation, unsaved-change, safety, conflict, and recovery dialogs                          |
| `commandController`, `applicationCommandController` | Command registration and execution                                                                     |
| `layoutController`                                  | Layout bounds, visibility, reset, and persistence                                                      |
| `documentAnalysisController`                        | Worker requests for outline, map, and word count; outdated results are ignored                         |
| `searchController`                                  | Project search, quick open, request cancellation, and search-batch events                              |
| `documentWorkflowController`                        | Open, save, close, autosave, reload, conflicts, editor flushing, and undo/redo                         |
| `workspaceWorkflowController`                       | Project open/restore, tree loading, create, rename, trash, and branch refresh                          |
| `documentFeaturesController`                        | Find/replace, templates, image import, links/history, printing, and moves; creates and disposes search |
| `applicationLifecycleController`                    | Startup restoration, recovery prompts, native subscriptions, and window-close handling                 |

The document-analysis worker lives in `src/workers`. Settings are normalized in the application layer and persisted by infrastructure.

## Native Ports

Contracts are defined in `src/application/ports/nativePorts.ts` and implemented in `src/infrastructure/tauri`.

| Port                 | Capabilities                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentFilePort`   | Open/save text, close native document handles, and import images                                                                              |
| `WorkspaceFilePort`  | Open/restore projects, list directories, manage hidden paths and watcher scope, create/rename/move/trash files, list files, and search/cancel |
| `SessionStoragePort` | Load/save sessions and recovery snapshots                                                                                                     |
| `DiagnosticsPort`    | Local event logs, logs-folder access, and diagnostic export                                                                                   |
| `NativeEventPort`    | Event subscriptions and native window close/destroy operations                                                                                |

For a new native capability, extend the relevant port and implement its adapter. Inject the port into the controller. Keep direct Tauri imports in infrastructure.

## Rust Native Layer

Modules are under `src-tauri/src/native`. `lib.rs` registers commands, initializes state and logging, and installs the panic hook.

| Module           | Responsibility                                                                    |
| ---------------- | --------------------------------------------------------------------------------- |
| `types.rs`       | Serializable data shared with TypeScript                                          |
| `errors.rs`      | Error codes, retry information, user messages, and diagnostics                    |
| `state.rs`       | Authorized documents/workspaces and watcher/search state                          |
| `paths.rs`       | Path normalization, validation, and workspace boundaries                          |
| `watcher.rs`     | Watches loaded directories and open documents; filters events and temporary saves |
| `documents.rs`   | Text decoding, format detection, atomic save, and stale-file checks               |
| `workspace.rs`   | Project authorization, directory listing, bounded traversal, and file operations  |
| `search.rs`      | Cancellable file listing/search, limits, text offsets, and result batches         |
| `images.rs`      | Image validation, imports into document assets, and preview authorization         |
| `persistence.rs` | Session and recovery storage                                                      |
| `diagnostics.rs` | Local logs and export with sensitive values removed                               |

## Main Data Flows

### Opening a document

The UI calls the shell, and `documentWorkflowController` requests a file through `DocumentFilePort`. Rust checks access and returns content, path, format, and fingerprint. The document controller records it; the pane controller opens a view. Session persistence is scheduled.

### Editing a document

Source or Visual reports a content update. The document controller advances the revision and shared history, then visible views of the same document synchronize. Autosave and recovery persistence are scheduled as needed.

### Save and autosave

The document workflow flushes the current editor and uses the save queue. The native port receives content, format, and expected fingerprint. Rust rejects a stale file and writes atomically while preserving BOM and line endings. The controller records the saved revision or an explicit error/conflict. Saving a new path refreshes the affected project branch.

### Switching Source and Visual modes

The shell checks that the document supports Markdown and confirms Visual safety. It flushes pending content and captures selection/scroll state before changing the pane's mode. Unsupported syntax stays in source blocks; remote images keep their document permission.

### Updating settings and layout

The settings view edits state exposed by the shell. Application rules normalize values; infrastructure persists them and migrates old layout values when loading.

### Opening and updating a workspace

Rust authorizes a chosen root. The workspace controller stores its tree; directory contents load when needed. File operations remap open paths and refresh affected branches. Watcher scope follows loaded directories and open documents.

### Filesystem watcher event

The lifecycle controller receives native file events and forwards them to `externalChangesController`. It marks missing/conflicting documents, schedules reloads, and refreshes affected branches.

### Project search and quick open

Search flushes visible editors and includes unsaved content from open documents. Those paths are excluded from the native scan. Rust scans the authorized root, respecting ignored names and hidden paths, and streams `folden://workspace-search-batch` events with project/request IDs. The controller ignores old results and cancels superseded requests.

Native scans stop at 100,000 entries or 32 levels of depth and skip symbolic links. Search reads files up to 2 MiB and returns up to 5,000 matches. Quick open displays at most 100 ranked candidates. Partial results and skipped files are reported. Selecting a search result reveals its text range in Source mode.

### Images, document links, and printing

- Image import saves a new draft first. Rust validates the image, writes it to the document's assets folder, and returns a relative reference. Local previews require authorized access; remote images require permission for the document.
- Relative document links resolve through a domain helper. The features controller opens the target and optional heading anchor and stores navigation history for the current project.
- Print preparation flushes editors and captures content and image permission. `PrintView.vue` renders that fixed snapshot and calls the system dialog. The application cannot confirm that a PDF was saved or a page printed.
- Moving Markdown carries the sibling `<stem>.assets` folder. A destination collision blocks the move. If moving assets fails, Rust attempts to move the document back. References inside documents remain unchanged and need checking after a move.

### External conflict

A save or watcher event detects an external change. The conflict dialog offers the disk version, the Folden version, a separate copy, or a merged result. The document workflow applies the choice while protecting unsaved content.

### Session persistence

The shell watches project, pane, mode, document metadata, and recovery changes. The session controller delays and serializes writes through `SessionStoragePort`. Session records contain paths, names, pane layout, and modes. Drafts and dirty files produce recovery snapshots with content, format, and disk fingerprint. All active dirty documents are retained. Pending recovery entries are deduplicated and limited separately to 64.

### Recovery after crash

Startup loads the session and recovery snapshots, restores available files/layout, and asks which recovery entries to restore or discard. The resulting open documents and recovery state are then saved.

### Closing the application

The lifecycle controller handles the native close request and asks about unsaved changes. It awaits final session/recovery writes and destroys the window after finalization. A persistence failure keeps the window open and reports the error. Native document handles are released when documents close; the remaining native state ends with the app process.

## Adding a Feature

1. Find the existing component, controller, or domain rule that owns the behavior.
2. Extend its state/actions. Use a native port when the feature needs OS access.
3. Connect the action through the shell and relevant UI component.
4. Update TypeScript/Rust contract tests when native data or commands change.
5. Test at the level where the behavior lives.

## Document safety

Preserve unchanged document text, unsupported Markdown, BOM, and line endings. Route writes through the save queue and expected-fingerprint checks. Saved document files remain the primary copy; session and recovery data support restoration. Keep errors visible and protect the only unsaved copy during reload, conflict resolution, and close.

## Testing Map

| Change                                      | Checks                                       |
| ------------------------------------------- | -------------------------------------------- |
| Document, Markdown, or project rule         | Domain unit tests                            |
| Controller or workflow                      | Unit tests with fake native ports            |
| Native data/command contract                | TypeScript/Rust contract tests               |
| Rust paths, file operations, or persistence | Rust module tests                            |
| User editing or project flow                | Targeted unit tests and Playwright E2E       |
| Save, recovery, watcher, or window close    | Relevant unit/Rust tests and a desktop check |

Tests live in `tests/unit`, `tests/contracts`, and `tests/e2e`. Performance checks cover large documents and projects separately. Commands are listed in [Development](DEVELOPMENT.md); checks on real operating systems are recorded in [beta verification](BETA-0.12.0.md).

## Lifecycle and Cleanup

Controllers that create timers, subscriptions, or workers expose `dispose`. Give each subscription one owner. If asynchronous registration finishes after disposal, remove the new listener immediately. On unmount, the shell disposes feature, layout, lifecycle, and analysis controllers; lifecycle cleanup also disposes document, session, and external-change work.
