# Folden 0.3 Implementation Plan

**Release:** `0.3.0`  
**Working title:** Reliable Editing  
**Source specification:** `specs/FOLDEN_V0.3_SPEC.md`  
**Baseline checked against:** Folden `0.2.3`

## Planning Decisions

- Scope for 0.3 is the reliability core: safer filesystem access, shared document state, editor synchronization, safe saving, recovery, watcher, diagnostics, and tests.
- Architecture changes are incremental. Do not rebuild the whole frontend into the full proposed layer model before reliability work needs it.
- Document-level undo/redo is not assumed to be straightforward. Start with a prototype task and stop if CodeMirror/Tiptap integration conflicts with the agreed model.
- Product files remain the source of truth. Internal storage may keep session, recovery, fingerprints, view state, logs, and caches only.
- The frontend must stop being the authority for absolute paths before recovery, watcher, and autosave-like behavior are added.

## Current Baseline Audit

The specification's baseline matches the repository in the important areas:

- `src/App.vue` owns most document, pane, workspace, save, shortcut, and dialog orchestration.
- `src/SourceEditor.vue` wraps CodeMirror and replaces the full document when `modelValue` changes.
- `src/VisualMarkdownEditor.vue` wraps Tiptap and serializes updates with `editor.getMarkdown()`.
- `src/tauriFiles.ts` passes frontend-owned string paths to Rust commands.
- `src-tauri/src/lib.rs` performs native file operations and saves with direct `fs::write`.
- Dirty state is `content !== savedContent`.
- Workspace loading recursively reads the tree.
- Browser `prompt` and `confirm` are used for file names, links, images, close, rename, and trash confirmations.
- CSP is disabled in `src-tauri/tauri.conf.json`.
- No project-owned frontend, Rust, integration, or end-to-end test suite is present.

Already partially implemented:

- Native file open/save dialogs.
- Workspace folder opening and basic create/rename/trash operations.
- Tabs and two fixed panes.
- Opening the same document in both panes as one shared `OpenDocument`.
- Independent pane mode selection for Visual/Source.
- Basic same-document content propagation through Vue props.
- Physical-key shortcuts for core actions.

Important gaps:

- No document revisions, persisted revisions, fingerprints, save queue, typed errors, atomic writes, recovery snapshots, watcher, session restore, controlled dialogs, Markdown safety gate, shared undo/redo history, or automated regression checks.
- Current same-document synchronization is accidental and too coarse: full replacements can reset editor state and there is no explicit loop-prevention or stale-update handling.
- Current Rust path validation is helpful but not a trust boundary because the frontend supplies both root and target absolute paths.

## Task 1. Add Test Harness And Minimal Domain Core

### Goal and Dependencies

Create the smallest testing and domain foundation needed to safely change document behavior.

Depends on no previous 0.3 task.

### Scope

- Add Vitest for pure TypeScript tests.
- Add Rust unit/integration test setup using temporary directories.
- Introduce minimal domain types for documents, revisions, dirty state, file fingerprints, and typed native errors.
- Keep the first domain module independent from Vue and Tauri.
- Add npm scripts for `typecheck`, `test`, and keep `build` deterministic.

### Non-goals

- Do not add Pinia yet unless a later task needs it.
- Do not move UI components.
- Do not implement save queue, recovery, watcher, or dialogs in this task.
- Do not add broad lint/format tooling unless it is needed for CI consistency.

### Current State

- `npm run build` already runs `vue-tsc --noEmit && vite build`.
- No `test` script exists.
- Document state is inline in `src/App.vue`.
- Rust filesystem logic is not covered by tests.

### Touched Areas

- `package.json`
- TypeScript test config if needed
- `src/domain/`
- `src-tauri/src/`
- `src-tauri/Cargo.toml`

### Agreed Approach

- Define only primitives needed by following tasks: `DocumentId`, `DocumentRevision`, dirty check by revision, `FileFingerprint`, `NativeError`.
- Prefer simple functions over stores or classes.
- Add tests for revision increments, dirty state, and typed error shape.
- Add Rust test helpers for temp workspaces and path fixtures.

### Acceptance Criteria

- `npm run test` runs frontend unit tests.
- `npm run typecheck` runs TypeScript checks without building assets.
- Rust tests can be run with `cargo test` from `src-tauri`.
- Document dirty state can be represented without `savedContent`.

### Checks

- `npm run typecheck`
- `npm run test`
- `cd src-tauri && cargo test`

### Stop Conditions

- Stop if adding Vitest requires a major Vite/Vue upgrade.
- Stop if Rust test setup requires changing production filesystem behavior.

## Task 2. Extract Document And Workspace State Incrementally

### Goal and Dependencies

Reduce `App.vue` ownership enough to support reliability work while preserving the current UI.

Depends on Task 1.

### Scope

- Move document collection operations out of `App.vue`.
- Replace array search as the primary document model with ID-keyed state.
- Add document revisions and persisted revisions.
- Keep panes as views over document IDs.
- Preserve current behavior for tabs, split view, dirty markers, mode switching, and opening the same file twice.

### Non-goals

- Do not complete the full proposed `stores/` and `services/` architecture.
- Do not introduce command palette, settings, notifications, or recovery.
- Do not change visible UI except where required by state migration.

### Current State

- Documents are `OpenDocument[]`.
- Dirty state compares `content` and `savedContent`.
- Pane mode is keyed by `paneId:documentId`.
- Opening an already-open path reuses the existing document object.

### Touched Areas

- `src/App.vue`
- `src/domain/`
- Optional `src/services/` or `src/stores/` if the extraction stays small

### Agreed Approach

- Prefer a small document model module/composable first.
- Keep `App.vue` as composition root and layout owner.
- Store document content once per document.
- Increment `revision` on accepted content changes.
- Set `persistedRevision` on successful save.
- Keep path matching behavior compatible with current Windows normalization until Task 3 replaces path authority.

### Acceptance Criteria

- Opening, editing, saving, closing, and moving tabs between panes still works.
- Opening the same file twice still produces one document state.
- Dirty markers use revision comparison.
- No second full `savedContent` string is used solely for dirty detection.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual smoke in browser or Tauri for open/edit/save/split flows.

### Stop Conditions

- Stop if state extraction starts requiring a full UI rewrite.
- Stop if the new model cannot preserve existing same-file tab reuse.

## Task 3. Introduce Safe Rust Filesystem Boundary

### Goal and Dependencies

Stop accepting arbitrary frontend absolute paths for workspace operations.

Depends on Task 1. Can run before or after Task 2 if bridge changes are isolated.

### Scope

- Add Rust-owned app state for authorized workspaces and opened documents.
- Return opaque workspace and document handles from native dialogs.
- Convert workspace operations to handle + relative path APIs.
- Reject absolute relative-path inputs, `..`, separator injection in names, Windows invalid names, trailing dot/space, control characters, symlink escape, and workspace-root trash.
- Return serializable typed errors instead of plain strings for new APIs.
- Keep old bridge functions only temporarily while migrating UI calls, then remove them in the same task or a follow-up substep.

### Non-goals

- Do not add watcher or session persistence here.
- Do not implement atomic save here unless needed as a small helper.
- Do not add external document persistence beyond the opened document handle.

### Current State

- Frontend calls `listDirectory(root, path)`, `openTextFileByPath(root, path)`, `createFile(root, parentPath, name)`, and similar functions.
- Rust canonicalizes root and path, but both are frontend-provided.
- `trash_path` can be called on the workspace root if the frontend sends it.

### Touched Areas

- `src-tauri/src/lib.rs`
- `src/tauriFiles.ts`
- `src/App.vue`
- Rust tests

### Agreed Approach

- First implement new handle-based commands alongside typed errors.
- Migrate frontend bridge to the new command names.
- Use relative workspace paths in frontend tree entries.
- Display absolute paths only as labels returned from trusted Rust descriptors.
- Keep Rust as the only owner of canonical root paths.

### Acceptance Criteria

- Frontend can no longer read, write, rename, create, or trash workspace paths by sending arbitrary absolute paths.
- Traversal and symlink escape tests pass.
- Workspace root cannot be moved to trash.
- Invalid names produce typed errors and no filesystem mutation.
- Existing workspace open, tree display, open file, create, rename, and trash flows still work.

### Checks

- `npm run typecheck`
- `npm run test`
- `cd src-tauri && cargo test`
- Manual Tauri smoke for workspace operations.

### Stop Conditions

- Stop if Tauri state lifetime or serialization makes handles unreliable across command calls.
- Stop if relative tree migration would require changing most UI behavior at once; split into bridge-only and UI-migration subtasks.

## Task 4. Implement Atomic Save, Fingerprints, And Save Queue

### Goal and Dependencies

Make saves ordered, stale-save-safe, and resistant to partial writes.

Depends on Tasks 1, 2, and 3.

### Scope

- Add file fingerprints from Rust open/save metadata.
- Replace direct existing-file save with temp-file write in the same directory and atomic replacement where supported.
- Add per-document save queue in frontend service/domain code.
- Save a captured revision and content snapshot.
- Update `persistedRevision` only for the saved revision.
- Preserve LF/CRLF and UTF-8 BOM for opened text files where practical.
- Surface save errors as document state.

### Non-goals

- Do not implement autosave to disk.
- Do not implement recovery snapshots.
- Do not build full conflict UI beyond typed stale-save errors.
- Do not support arbitrary encodings beyond common UTF-8 variants.

### Current State

- `save_text_file` writes directly with `fs::write`.
- Successful save sets `savedContent = content`.
- Save refreshes the entire workspace tree.
- No fingerprint prevents stale overwrites.

### Touched Areas

- `src-tauri/src/lib.rs`
- `src/tauriFiles.ts`
- document/save domain modules
- `src/App.vue`
- Rust and frontend tests

### Agreed Approach

- Rust owns atomic write and fingerprint comparison.
- Frontend owns save queue ordering by document revision.
- Manual save flushes active editor content before queueing.
- Autosave remains out of scope for this task.
- Avoid workspace refresh after every save unless the path changed through Save As.

### Acceptance Criteria

- Existing-file saves do not use direct `fs::write`.
- Failed atomic save leaves the original file intact in tested cases.
- Concurrent saves for one document serialize.
- A stale save completion cannot mark a newer revision as persisted.
- Stale fingerprint returns a typed conflict error.
- Save As works for scratch documents and registers the returned document handle/path display.

### Checks

- `npm run typecheck`
- `npm run test`
- `cd src-tauri && cargo test`
- Manual Windows smoke for save, Save As, repeated fast saves, and save failure where practical.

### Stop Conditions

- Stop if Windows replacement semantics require a crate or API choice not already agreed.
- Stop if preserving metadata conflicts with reliable atomic replacement; document the limitation and ask for a decision.

## Task 5. Add Editor View Sessions And Explicit Synchronization

### Goal and Dependencies

Make same-document multi-view editing intentional and stable.

Depends on Tasks 1, 2, and 4.

### Scope

- Introduce editor view IDs and per-view sessions.
- Add explicit update origin, base revision, next content, and update kind.
- Add Source editor adapter behavior for external content without feedback loops.
- Add Visual editor adapter behavior for external content with `emitUpdate: false`.
- Preserve independent pane mode, scroll position, and best-effort selection.
- Flush editor content before save, mode switch, close, recovery snapshot, and conflict actions.

### Non-goals

- Do not implement ProseMirror step synchronization in the first pass.
- Do not implement full document-level undo/redo here.
- Do not guarantee perfect cursor mapping after structural Visual/Source conversion.

### Current State

- Both editors emit `update:modelValue`.
- Source editor applies changed props by replacing the entire CodeMirror document.
- Visual editor applies changed props with `setContent(..., emitUpdate: false)`.
- There is no view ID, base revision, adapter registry, or stale-update rejection.

### Touched Areas

- `src/SourceEditor.vue`
- `src/VisualMarkdownEditor.vue`
- document sync domain/service code
- `src/App.vue`
- frontend tests

### Agreed Approach

- Keep canonical content as Markdown/plain text string.
- Process updates serially per document.
- Ignore stale updates instead of silently overwriting newer revisions.
- Originating view does not reapply its own update.
- Other views apply external revisions without emitting duplicate domain updates.
- Use simple full-content replacement first, but preserve scroll/selection where editor APIs allow.

### Acceptance Criteria

- Same document can be visible in both panes.
- Source/Source, Visual/Visual, and Source/Visual edits propagate both ways.
- No update loop occurs.
- Typing in one pane does not reset the other pane to the top in normal cases.
- Each pane can keep independent mode and scroll position.
- Save status is shared per document.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual Tauri smoke with one document in both panes, mixed modes, edits from both panes, and save.

### Stop Conditions

- Stop if Tiptap Markdown serialization causes unexpected content loss on ordinary supported Markdown.
- Stop if preserving CodeMirror or Tiptap selection requires a larger adapter API than planned.

## Task 6. Prototype Shared Document Undo/Redo

### Goal and Dependencies

Decide whether document-level undo/redo can safely ship in 0.3.

Depends on Task 5.

### Scope

- Build a contained prototype for shared undo/redo over the document revision stream.
- Test Source/Source and Source/Visual flows.
- Investigate interaction with CodeMirror native history and Tiptap/ProseMirror history.
- Define memory limit and coalescing only if the prototype is viable.
- Produce a clear go/no-go result in code comments/tests/docs or task notes.

### Non-goals

- Do not force complete undo/redo into production if the prototype is unstable.
- Do not implement semantic merge or ProseMirror-step history.
- Do not let native editor histories diverge from document state.

### Current State

- Undo/redo is editor-native and not coordinated at app level.
- Global shortcut handling does not route document undo/redo commands.

### Touched Areas

- document sync/history domain module
- editor adapters
- command/shortcut handling
- frontend tests

### Agreed Approach

- Treat this as an explicit risk-reduction task.
- Prefer reversible text patches or bounded snapshots for the prototype.
- If viable, implement document-level `undo` and `redo` commands.
- If not viable, document the fallback: keep editor-native undo scoped to active editor for 0.3 and do not claim shared history in release notes.

### Acceptance Criteria

- A decision is made from a working prototype, not a guess.
- If accepted: Ctrl+Z/Ctrl+Shift+Z or Ctrl+Y from either pane applies shared document history without divergent editor state.
- If rejected/postponed: acceptance criteria and release notes are updated so 0.3 does not promise shared undo/redo.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual smoke for undo/redo from both panes.

### Stop Conditions

- Stop if editor-native history cannot be suppressed or reconciled without breaking basic typing.
- Stop if memory usage requires storing unbounded full document snapshots.

## Task 7. Replace Browser Dialogs And Add Close Protection

### Goal and Dependencies

Remove unsafe browser dialog flows and prevent accidental dirty-content loss.

Depends on Tasks 2 and 5. Works best after Task 4 for save states.

### Scope

- Add small application dialogs for text input, confirmation, unsaved close, and conflict-ready decisions.
- Replace `window.prompt` and `window.confirm` in production flows.
- Add close protection for closing a view versus closing the final view of a dirty document.
- Add application/window close interception for dirty documents.
- Route actions through a minimal command registry only where shortcuts and buttons share behavior.

### Non-goals

- Do not build a complete command palette.
- Do not add a full design system.
- Do not implement recovery or watcher conflict UI yet.

### Current State

- `App.vue` uses `window.prompt` for new file, new folder, rename, link, and image.
- `App.vue` uses `window.confirm` for dirty close and trash.
- Closing one view of a dirty document asks even if another view remains open.

### Touched Areas

- `src/App.vue`
- `src/VisualMarkdownEditor.vue`
- dialog components/composables
- shortcut/command code
- frontend tests

### Agreed Approach

- Implement minimal Vue-native dialogs with current styling.
- For one document shown in multiple panes, closing one view removes only that view without dirty discard prompt.
- Closing the final dirty view offers Save, Discard, and Cancel.
- Text-entry dialogs validate names before calling Rust.

### Acceptance Criteria

- No covered production flow uses browser `prompt` or `confirm`.
- Closing one of multiple views of the same dirty document does not ask to discard the document.
- Closing the final dirty view cannot silently discard content.
- Trash/rename/create dialogs are keyboard accessible enough for current release.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual Tauri smoke for create, rename, trash, link/image insertion, close dirty tab, and app close.

### Stop Conditions

- Stop if Tauri window close interception requires plugin/config changes beyond the task.
- Stop if link/image dialog behavior needs a product decision about allowed schemes before Task 11.

## Task 8. Add Session Restore And Recovery Snapshots

### Goal and Dependencies

Let dirty saved and scratch documents survive a process crash or restart without overwriting disk automatically.

Depends on Tasks 2, 4, 5, and 7.

### Scope

- Persist session state: authorized workspace references, open document references, pane layout, active tabs, modes, and view state where available.
- Persist recovery snapshots for dirty revisions and scratch documents.
- Add startup recovery inspection.
- Add recovery dialog actions: Restore, Open as Copy, Discard, Later.
- Bound recovery retention.
- Remove recovery snapshots after successful save or explicit discard.

### Non-goals

- Do not autosave dirty document content to the original file.
- Do not store document content in the session file.
- Do not implement full settings UI.

### Current State

- Recent workspaces are stored in `localStorage`.
- No tab/session restore exists.
- No recovery storage exists.

### Touched Areas

- Rust app data/storage commands or Tauri app data paths
- frontend session/recovery modules
- dialogs
- document state
- tests

### Agreed Approach

- Store recovery data in the app data directory, not beside user documents.
- Recovery snapshots may contain user text; logs must never include snapshot content.
- Restoring a snapshot updates in-memory document content and requires explicit save before disk overwrite.
- Malformed recovery records are skipped with visible diagnostics, not startup crashes.

### Acceptance Criteria

- Dirty saved document can be restored after forced process termination.
- Dirty scratch document can be restored after forced process termination.
- Clean saved documents do not produce false recovery prompts.
- Corrupt recovery record does not crash startup.
- Discard removes the snapshot.

### Checks

- `npm run typecheck`
- `npm run test`
- `cd src-tauri && cargo test`
- Manual Windows forced-kill recovery smoke.

### Stop Conditions

- Stop if app data path access needs a new Tauri permission/plugin decision.
- Stop if recovery storage format needs encryption or privacy policy beyond current scope.

## Task 9. Add Filesystem Watcher And Conflict Handling

### Goal and Dependencies

Detect external file changes and prevent silent overwrites.

Depends on Tasks 3, 4, and 8.

### Scope

- Add native watcher for authorized workspaces and opened external documents.
- Normalize watcher events to document/workspace events.
- Ignore or correlate self-generated save events.
- For clean open documents, reload external changes safely.
- For dirty open documents, enter conflict state and stop autosave/recovery-to-disk behavior.
- Handle external delete and rename as recoverable states.
- Update only affected workspace branches where practical.

### Non-goals

- Do not build a full diff/merge editor.
- Do not implement project-wide indexing.
- Do not recursively rescan the whole workspace on every event.

### Current State

- No watcher exists.
- Manual workspace refresh recursively reloads the whole tree.
- External changes can be overwritten by save with no warning.

### Touched Areas

- `src-tauri/src/lib.rs`
- watcher dependency/config if needed
- frontend event listeners
- document conflict state
- workspace tree state
- dialogs/banners
- tests

### Agreed Approach

- Rust owns watcher setup for authorized roots.
- Frontend receives typed events and maps them to document/workspace state.
- Conflict actions start minimal: Reload from Disk, Keep Folden Version, Save As, Dismiss/Later where appropriate.
- Self-save events update fingerprints without showing false conflicts.

### Acceptance Criteria

- Clean file modified externally reloads or prompts according to agreed UI without data loss.
- Dirty file modified externally cannot be overwritten without explicit user action.
- External delete moves document into recoverable missing-target state.
- Watcher unavailable state is visible.
- Rapid events are debounced.

### Checks

- `npm run typecheck`
- `npm run test`
- `cd src-tauri && cargo test`
- Manual Windows smoke with external editor changes, delete, rename, and app saves.

### Stop Conditions

- Stop if watcher crate behavior on Windows is too noisy without a prototype.
- Stop if rename detection is unreliable; fall back to delete/create states and document the limitation.

## Task 10. Make Workspace Loading Lazy And Measurable

### Goal and Dependencies

Avoid recursive workspace scans as the default behavior and record baseline performance.

Depends on Task 3. Can run before Task 9 if watcher integration is not started.

### Scope

- Change workspace tree loading to list one directory at a time.
- Load children when a directory expands.
- Preserve collapsed/expanded state across updates where possible.
- Keep built-in ignored directories such as `.git`, `node_modules`, `dist`, `build`, `target`, and `.cache`.
- Add simple performance measurements for startup, workspace open, large file open, and editor bundle size.

### Non-goals

- Do not add workspace-specific ignore settings UI.
- Do not add full project indexing or search.
- Do not optimize every render path before measurement.

### Current State

- Rust recursively reads all workspace descendants.
- Frontend tree entries always contain `children`.
- Directories are locally collapsed in `WorkspaceTree.vue`, but data is already loaded.

### Touched Areas

- Rust list-directory command
- `src/tauriFiles.ts`
- `src/WorkspaceTree.vue`
- workspace state in `App.vue` or extracted module
- docs/measurement file

### Agreed Approach

- Represent directories as unloaded, loading, loaded, or error.
- Request children for a relative directory only on expansion.
- Record before/after measurements with simple repeatable commands or manual steps.

### Acceptance Criteria

- Opening a workspace does not enumerate the complete tree.
- Expanding a folder loads its direct children.
- Existing create/rename/trash/open flows still work.
- Measurements are recorded in the repository.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual smoke on a workspace with nested folders.

### Stop Conditions

- Stop if lazy loading conflicts with watcher branch updates; align the tree state model before continuing.

## Task 11. Add Markdown, Link, Remote Image, And CSP Safety

### Goal and Dependencies

Prevent unsafe or lossy visual editing and reduce renderer security risk.

Depends on Tasks 5 and 7. CSP can be investigated earlier but should be finalized after image/link behavior is known.

### Scope

- Add Markdown safety detection for unsupported constructs before opening/switching to Visual mode.
- Add round-trip fixtures for supported Markdown constructs.
- Validate links and reject dangerous schemes.
- Disable automatic remote image loading by default, or block remote insertion until placeholder UX is ready.
- Enable production CSP compatible with Tauri IPC and required asset schemes.

### Non-goals

- Do not add table/task-list/frontmatter editing UI.
- Do not enable raw HTML support in Visual mode.
- Do not build a full diff view for lossy conversion.

### Current State

- Markdown files default to Visual mode.
- Tiptap Markdown parse/serialize can rewrite unsupported structures.
- Link and image URLs come from `window.prompt`.
- Remote image URLs can be inserted and rendered.
- CSP is `null`.

### Touched Areas

- `src/VisualMarkdownEditor.vue`
- Markdown safety domain module/tests
- dialogs
- `src-tauri/tauri.conf.json`
- docs/tests fixtures

### Agreed Approach

- Start with a conservative detector and warning/blocking behavior for known unsupported constructs.
- Do not permanently mark a document safe after one acknowledgment; safety is tied to revision/session.
- Only allow controlled schemes for links.
- Verify CSP in dev and release-like Tauri build.

### Acceptance Criteria

- Unsafe Markdown does not silently open in Visual and get rewritten.
- Supported fixture round-trips preserve content/structure within agreed whitespace tolerance.
- `javascript:` links are rejected.
- Remote images do not silently make network requests by default.
- Production CSP is no longer `null` and app still loads.

### Checks

- `npm run typecheck`
- `npm run test`
- `npm run app:build`
- Manual Visual/Source smoke for supported and unsupported Markdown.

### Stop Conditions

- Stop if Tiptap Markdown APIs cannot expose enough safety information for the detector; use explicit fixture-based blocklist and document limits.
- Stop if CSP blocks Tauri IPC or editor rendering and needs a Tauri-specific policy decision.

## Task 12. Add Diagnostics, CI, Versioning, And Release Hardening

### Goal and Dependencies

Make the release verifiable and debuggable without exposing document content.

Depends on most implementation tasks; can begin with CI earlier.

### Scope

- Add bounded local logging for warnings/errors in production.
- Add Rust panic hook and frontend uncaught error handler.
- Add Help/Open Logs Folder action.
- Add GitHub Actions Windows workflow for install, typecheck, tests, build, Rust fmt/clippy/tests, and Tauri build without publishing.
- Add version consistency script for npm, Tauri, Cargo, lockfiles where needed, and changelog.
- Update package metadata.
- Update docs and changelog for 0.3 behavior.

### Non-goals

- Do not collect telemetry.
- Do not upload logs automatically.
- Do not build installer publishing.

### Current State

- `tauri-plugin-log` is enabled only in debug setup.
- Cargo metadata is placeholder.
- No CI workflow is present.
- Version is `0.2.3` in package, Tauri config, and Cargo.

### Touched Areas

- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `package.json`
- GitHub Actions workflow
- docs and changelog
- scripts

### Agreed Approach

- Logs include operation names, error codes, app version, OS/arch where available.
- Logs must not include document content or full user paths by default.
- CI should reflect the smallest meaningful release gate, with Windows as the required target.
- Version bump happens at release-hardening time, not at the start of 0.3 work.

### Acceptance Criteria

- All required checks run locally and in CI.
- Logs can be opened from the app.
- Logs do not contain document text in tested error paths.
- Version consistency script fails on mismatched versions.
- Changelog and docs describe only implemented behavior.

### Checks

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `cd src-tauri && cargo fmt --check`
- `cd src-tauri && cargo clippy -- -D warnings`
- `cd src-tauri && cargo test`
- `npm run app:build`
- Manual Windows release-candidate smoke from the specification's acceptance matrix, scoped to implemented 0.3 reliability core.

### Stop Conditions

- Stop if CI/Tauri build needs signing, installer publishing, or secrets not available in the repository.
- Stop if production logging needs a privacy decision beyond local bounded logs.

## Release Acceptance Summary

0.3 can be called complete when:

- Existing 0.2 flows still work: workspace open, tree actions, file open/save, Visual/Source editing, tabs, split view.
- Frontend no longer has authority to read/write arbitrary absolute workspace paths.
- Existing document saves are atomic and stale-save-safe in tested Windows scenarios.
- Same-document multi-view editing is explicit and loop-free.
- Dirty saved and scratch documents can be recovered after a forced termination.
- External file changes cannot be silently overwritten.
- Browser dialogs are removed from covered production flows.
- Unsafe Markdown and dangerous links cannot be silently converted or stored through Visual mode.
- CSP is enabled in production.
- Automated frontend and Rust tests cover the critical domain and filesystem paths.
- Windows CI and manual smoke pass before the release version is bumped.

## Deferred Or Conditional Items

- Full four-layer frontend architecture is deferred unless incremental tasks naturally require it.
- Full document-level undo/redo ships only if Task 6 prototype succeeds.
- ProseMirror-step synchronization is deferred; controlled Markdown replacement is acceptable for first 0.3 sync if it is safe.
- Full merge editor, semantic diff, SQLite indexing, backlinks, command palette, custom blocks, plugin API, and export remain out of scope.
