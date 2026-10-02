# Folden Architecture

This document describes the current codebase. It is the main reference for changing the application structure.

## Dependency Flow

```text
UI
  ↓
applicationShell / public facade
  ↓
controllers and workflows
  ↓
application ports
  ↓
Tauri infrastructure adapters
  ↓
Rust native modules
  ↓
filesystem and operating system
```

Dependencies should keep flowing downward. Higher layers may depend on lower-layer contracts and pure domain rules. Lower layers must not import UI or application orchestration to do their work.

## Frontend Layers

### `src/ui`

Vue views, editors, dialogs, and workspace UI live here. UI components render state and call the public application facade. They should not contain domain rules, native command wiring, save queues, or filesystem policy. `navigation/DocumentOutline.vue` and `navigation/DocumentMap.vue` share Markdown navigation rendering; Source and Visual editors retain only engine-specific scrolling adapters. Visual editor setup, node views, and block controls live beside `VisualMarkdownEditor.vue` as focused editor adapters. `views/SettingsView.vue` renders settings controls while application state remains in the facade.

### `src/application`

Application orchestration lives here:

- `applicationShell.ts` composes controllers, infrastructure adapters, lifecycle hooks, and the facade returned to the UI.
- `controllers/` owns application state, workflows, dialogs, commands, layout settings, session persistence, external changes, and lifecycle.
- `state/` contains Vue-backed application stores; pure document types and rules stay in `domain`.
- `settings/` owns application and layout setting types, defaults, limits, and normalization.
- `i18n.ts` owns reactive interface translation with English keys; `systemLanguage.ts` detects the initial language without a Vue dependency. Settings own the persisted language.
- `ports/nativePorts.ts` defines the application-side contracts for native capabilities.
- helpers and shell types keep application-specific formatting and facade types near the shell.

Application workflows may use domain rules and application ports. They must not import Tauri APIs directly.

### `src/domain`

Framework-independent rules and types live here:

- document revision and dirty-state helpers;
- document types, history, editor-session synchronization, and save queue;
- Markdown safety, image path resolution, conflict diffing, outline extraction, and document-map construction;
- native DTO guards and native error shape;
- workspace filtering rules.
- document templates, relative document-link resolution, and text-match ranges for Source and Visual search.

`domain` must not depend on Vue, Tauri, UI components, browser storage, or infrastructure adapters.

### `src/infrastructure`

Infrastructure implements application contracts:

- `infrastructure/tauri/nativePorts.ts` groups Tauri-backed implementations of native ports;
- `infrastructure/tauri/files.ts` contains low-level Tauri command invocation helpers;
- `infrastructure/tauri/visualImageAssets.ts` converts resolved local image paths through Tauri's asset protocol;
- `infrastructure/settings/settings.ts` persists browser-side application and layout settings and handles legacy layout migration.

Infrastructure can depend on application port types and domain DTOs. It should not own product workflows.

## Allowed Dependencies

- `domain` is pure TypeScript logic with no Vue, Tauri, UI, or infrastructure dependency.
- `application` uses domain rules and application port contracts.
- Application workflows do not import Tauri APIs directly.
- `infrastructure` implements application ports.
- `ui` calls the application facade returned by `useApplicationShell`.
- UI layout components such as `ActivityRail.vue`, `OpenEditors.vue`, `DocumentToolbar.vue`, and `EditorPaneGrid.vue` own rendering and direct interaction details, not application workflows.
- `applicationShell` is the composition root. It wires dependencies and exposes state/actions, but it is not the place for new domain logic or large workflows.

## State Ownership

Controllers own state. Outside code receives refs, computed values, and explicit methods rather than mutating another controller's internals.

State-controller responsibilities:

- `documentController` owns open documents, document revisions, dirty state, external states, save state, and document content updates.
- `paneController` owns panes, active pane, split state, document-to-pane layout, editor sessions, and per-pane document modes.
- `workspaceController` owns the opened workspace, tree expansion/loading/error state, selection, recent workspaces, and workspace path remapping.
- `sessionController` owns pending recovery entries, session snapshot building, recovery snapshot building, debounced persistence, and disposal of its persistence timer.
- `externalChangesController` owns watcher warnings, debounced workspace refreshes, debounced document reloads, and routing of native filesystem events.
- `visualSafetyController` owns Visual-mode safety decisions and per-document remote-image permissions.
- `dialogController` owns prompt, confirm, unsaved, Markdown safety, conflict, and recovery dialog state.
- `commandController` and `applicationCommandController` own command registration and command execution.
- `layoutController` owns layout state, bounds, visibility actions, reset behavior, and persistence coordination.
- `searchController` owns project search and quick-open state, request IDs, cancellation, bounded result merging, debounce timers, and the native search-batch subscription.
- Application settings and layout settings are normalized in `src/application/settings`. Browser storage access stays in `src/infrastructure/settings/settings.ts`.

Workflow-controller responsibilities:

- `documentWorkflowController` coordinates document open, save, save as copy, close, autosave, reload, conflict handling, pane editor flushing, and undo/redo.
- `workspaceWorkflowController` coordinates workspace opening, restoration, tree loading, file/folder creation, rename, trash, split opening, and branch refresh after file changes.
- `applicationLifecycleController` owns mount/dispose behavior, startup restoration, recovery prompting, native event subscriptions, window close handling, final save/session persistence, and listener cleanup.
- `documentFeaturesController` owns the find/replace panel state, editor search coordination, immutable print snapshots, template creation, image-import workflow, relative-link navigation/history, and explicit workspace moves. It composes `searchController`; `dispose` removes its watchers and disposes search. The shell injects dependencies and exposes these actions.

Lifecycle code belongs in `applicationLifecycleController`. Controllers that create timers or listeners must expose `dispose`.

## Native Ports

Application code talks to native capabilities through `src/application/ports/nativePorts.ts`.

Port groups:

- `DocumentFilePort`: open text files, open workspace files by path, save text files, close native document handles, and import images from a picker or supplied bytes.
- `WorkspaceFilePort`: open or restore workspace directories, list directories, open files, create files/directories, rename/move/trash paths, list project files, and start/cancel project search.
- `SessionStoragePort`: load/save session state and recovery snapshots.
- `DiagnosticsPort`: log frontend events, open the logs folder, and export diagnostics.
- `NativeEventPort`: subscribe to native events and access the current native window close/destroy operations.

When adding a new Tauri capability, add the application port contract first, then implement it in infrastructure. Application controllers should receive the port through dependency injection instead of importing Tauri APIs.

## Rust Native Layer

Rust code lives under `src-tauri/src`.

Module responsibilities:

- `native/types.rs`: stable serializable DTOs shared with TypeScript contracts.
- `native/errors.rs`: native error codes, retryability, user messages, and technical diagnostics.
- `native/state.rs`: authorized native document/workspace state.
- `native/paths.rs`: path normalization, validation, root protection, and workspace-safe path helpers.
- `native/watcher.rs`: filesystem watcher setup, watcher event filtering, and Folden temp-save suppression.
- `native/documents.rs`: text file open/save, format detection, atomic writes, stale-fingerprint protection, and native document lifecycle.
- `native/workspace.rs`: workspace authorization, directory listing, shared bounded traversal, and workspace file open/create/rename/move/trash.
- `native/search.rs`: cancellable authorized project search and file listing, scan limits, match offsets, and streamed batches.
- `native/images.rs`: image format/size validation, collision-safe imports into document assets, and preview authorization.
- `native/persistence.rs`: session and recovery snapshot storage.
- `native/diagnostics.rs`: frontend event logging, logs-folder opening, and redacted diagnostic export.

`lib.rs` registers Tauri commands, configures native state and logging, installs the panic hook, and composes the native layer. New native modules should be wired through `lib.rs`, but `lib.rs` should not become the home for module-specific logic.

## Main Data Flows

### Opening a document

1. UI calls the application facade.
2. `documentWorkflowController` requests file content through `DocumentFilePort`.
3. Infrastructure invokes the Tauri command.
4. Rust validates access, reads and decodes the text file, returns content, format, path, and fingerprint.
5. `documentController` creates or updates the document state.
6. `paneController` attaches the document to the active pane and creates a view session.
7. Session persistence is scheduled.

### Editing a document

1. Source or Visual editor reports a content update.
2. `documentWorkflowController` flushes or routes the update.
3. `documentController` accepts the update, advances revision state, and records history.
4. `paneController` synchronizes visible sessions for the same document.
5. Autosave and session persistence are scheduled when relevant.

### Save and autosave

1. Save starts through `documentWorkflowController`.
2. The current pane editor is flushed.
3. The document enters queued/saving state.
4. `DocumentFilePort.saveTextFile` receives content, expected fingerprint, file format, and optional suggested name.
5. Rust rejects stale fingerprints, writes atomically, preserves format, and returns the updated fingerprint/path.
6. `documentController` marks the revision persisted or marks a conflict/error state.
7. Workspace refresh is scheduled when the saved path affects the tree.

### Switching Source and Visual modes

1. UI asks the facade to set a pane's document mode.
2. `applicationShell` rejects Visual mode for non-Markdown paths.
3. Unsupported Markdown stays in editable source blocks in the Visual projection; remote images retain per-document permission checks.
4. The current editor content is flushed before the mode changes.
5. `paneController` records the selected mode for that pane/document pair.

### Updating settings and layout

1. Settings UI edits `appSettings` or `layoutSettings` exposed by the application facade.
2. Application setting types, limits, defaults, and normalization live in `src/application/settings`.
3. Browser persistence is handled by `src/infrastructure/settings/settings.ts`.
4. Legacy persisted layout values are migrated at load time in infrastructure.
5. Document state remains separate from settings and session persistence.

### Opening and updating a workspace

1. `workspaceWorkflowController` requests a workspace through `WorkspaceFilePort`.
2. Rust authorizes the root and returns a descriptor.
3. The workspace controller stores the root and tree state.
4. Directory contents load lazily through `listDirectory`.
5. File operations update or remap workspace state and schedule focused branch refreshes.

### Filesystem watcher event

1. Rust emits a native filesystem event for the authorized workspace.
2. `applicationLifecycleController` owns the subscription and forwards the event.
3. `externalChangesController` routes the event.
4. Open documents are marked missing, conflicted, or scheduled for reload.
5. Workspace branches are refreshed without forcing a full tree reload when possible.

### Project search and quick open

1. `documentFeaturesController` flushes visible editors and coordinates selected-result activation through the document/pane workflows.
2. `searchController` searches current in-memory document contents and excludes those paths from the native scan so unsaved edits take precedence over disk contents.
3. `WorkspaceFilePort.startWorkspaceSearch` scans supported files under the authorized root, respecting ignored names and hidden/excluded paths. `listWorkspaceFiles` supplies quick-open candidates.
4. Rust streams `folden://workspace-search-batch` with workspace/request IDs. The controller ignores stale batches and completion results, merges current matches, and cancels superseded work through `cancelWorkspaceSearch`.
5. Native scans stop at 100,000 entries or 32 levels, do not follow symbolic links, search files up to 2 MiB, and cap matches at 5,000. Quick open displays at most 100 ranked candidates. Partial/skipped feedback remains visible.
6. Search results reveal a current text range in Source. Disposal clears debounce work, removes watchers/listeners, and cancels active requests.

### Images, document links, and printing

- Image import first ensures the document is saved, then uses `DocumentFilePort`. Rust validates and writes the asset; the editor inserts its relative reference. Previews use authorized local assets or explicit per-document permission for remote images.
- Relative Markdown links resolve through the domain helper. `documentFeaturesController` opens the target, reveals an optional heading anchor, and owns back/forward history for the current workspace.
- Print preparation flushes editors and captures document content and image policy once. `PrintView.vue` renders that snapshot in a read-only print layout using existing Markdown extensions, then calls the system print dialog. Printing does not mutate the document or confirm PDF completion.
- Explicit moves use the workspace port, remap open document/tree paths, and refresh the workspace. Markdown moves carry a sibling `<stem>.assets` folder, reject destination asset collisions, and attempt to roll back the document if the asset move fails. They do not rewrite links or image references inside documents.

### External conflict

1. A save or watcher event detects that the file changed outside Folden.
2. `documentController` marks the document conflict state.
3. The user can reload disk content, keep Folden content, save as copy, or apply a merged result.
4. `documentWorkflowController` performs the chosen action through document state and native ports.

### Session persistence

1. `applicationShell` watches the workspace, panes, modes, document metadata, and recovery entries.
2. `sessionController` debounces persistence.
3. `SessionStoragePort` writes session state and recovery snapshots through Rust persistence.
4. Saved documents keep path/fingerprint metadata. Scratch and dirty documents can produce recovery entries.

### Recovery after crash

1. Startup loads session state and recovery snapshots through `applicationLifecycleController`.
2. Valid session layout and documents are restored when possible.
3. Pending recovery entries are shown in the recovery dialog.
4. The user chooses entries to restore or discard.
5. Restored content becomes open documents; recovery state is updated.

### Closing the application

1. `applicationLifecycleController` handles native close requests.
2. Dirty documents trigger explicit unsaved-change handling.
3. Final session and recovery writes are awaited.
4. Native document handles are closed.
5. Timers and listeners are disposed.
6. The native window is destroyed only after finalization.

## Adding a Feature

1. Decide whether the feature is a domain rule, application workflow, UI behavior, infrastructure adapter, or native operation.
2. Add or extend pure domain types/rules when the behavior is independent from Vue and Tauri.
3. Extend an existing controller when ownership is already clear. Create a new workflow only for a separate responsibility.
4. Add an application port only when the feature needs a native or environment capability.
5. Implement the Tauri adapter in `src/infrastructure/tauri`.
6. Add or extend a Rust command/module only when the operation must cross into native code.
7. Wire dependencies in `applicationShell`.
8. Expose the smallest needed facade API to `src/ui`.
9. Add tests at the level where the behavior lives.

Example frontend-only feature:

1. Add a domain helper if there is a pure rule.
2. Add controller state/methods for the behavior.
3. Expose the method from `useApplicationShell`.
4. Update the relevant Vue component.
5. Add domain/controller tests and an E2E check if the workflow is user-visible.

Example feature requiring filesystem/native access:

1. Define or extend the application port.
2. Add the infrastructure Tauri invocation.
3. Add the Rust command and module logic.
4. Update TypeScript/Rust contract tests if DTOs change.
5. Inject the port into the workflow controller.
6. Add Rust tests and application workflow tests.

## Rules Not To Break

- Do not add domain logic to Vue components.
- Do not add large workflows to `applicationShell`.
- Do not import Tauri APIs directly from application controllers.
- Do not mutate another controller's state outside its methods.
- Do not bypass the save queue or session persistence coordination.
- Do not duplicate native DTOs without contract tests.
- Do not store saved user document content as the canonical copy in hidden app data.
- Do not change native command contracts without updating TypeScript/Rust contract tests.

## Testing Map

| Change type                                | Required tests                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Pure document/workspace/Markdown rule      | Domain unit tests                                                             |
| Controller state ownership                 | Controller unit tests                                                         |
| Workflow orchestration                     | Workflow/controller unit tests with fakes                                     |
| Native port adapter shape                  | Application-port or infrastructure tests when available                       |
| Native DTO or command contract             | TypeScript/Rust contract tests                                                |
| Rust path/filesystem/persistence behavior  | Rust module tests                                                             |
| User-visible editing/workspace flow        | Playwright E2E smoke plus targeted unit tests                                 |
| Close, save, recovery, or watcher behavior | Unit tests, Rust tests when native behavior changed, and manual desktop smoke |

Current Playwright E2E specs live in `tests/e2e`:

- `panes-tabs.spec.ts`: split panes, tab reorder/transfer, Open Editors, and malformed drag payloads.
- `recovery-conflict.spec.ts`: recovery, external changes, missing files, and conflicts.
- `settings-autosave.spec.ts`: settings persistence, diagnostics export, and autosave behavior.
- `shell-layout.spec.ts`: activity rail, toolbar behavior, layout persistence, fit labels, and reset layout.
- `visual-safety.spec.ts`: Visual-mode safety and local/remote image behavior.
- `workspace-save.spec.ts`: workspace open/create/rename/trash and save refresh flows.
- `beta-workflows.spec.ts`: templates, search/quick open, relative links/history, RU/EN, and mocked print snapshots. WebView2 and installer checks are recorded separately in [BETA-0.12.0.md](BETA-0.12.0.md).

## Lifecycle and Cleanup

- Controllers that own timers, debounced work, or listeners must expose `dispose`.
- Each subscription should have one clear owner.
- Async listener registration must tolerate early disposal.
- Final session and recovery persistence must finish before the native window is destroyed.
- Native document handles should be closed when the app finalizes or documents are removed.
