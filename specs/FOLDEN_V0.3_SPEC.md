# Folden 0.3 - Technical Specification

**Target release:** `0.3.0`  
**Working title:** Reliable Editing  
**Status:** Draft for implementation  
**Baseline:** Folden `0.2.3`  
**Suggested repository path:** `docs/V0.3_SPEC.md`

---

## 0. Specification authority

Product goals, safety requirements, invariants, and acceptance criteria in this document are authoritative.

Suggested file names, module boundaries, APIs, data structures, libraries, thresholds, and implementation sequences are proposals rather than mandatory designs unless explicitly marked otherwise.

Before implementing a phase, compare its proposed design with the current repository. If the proposal conflicts with existing architecture, framework constraints, or a substantially simpler safe solution, stop and document the conflict before changing code.

Do not silently ignore a requirement and do not blindly implement a proposed design that does not fit the project.

---

## 1. Release summary

Folden 0.3 must turn the current working Markdown editor into an application that can be trusted for long writing sessions and real user documents.

Version 0.2 proved the core product concept:

- local desktop application;
- direct work with user-owned files;
- visual Markdown editing with Tiptap;
- source editing with CodeMirror;
- workspace tree;
- tabs;
- two-pane split view;
- basic file operations.

Version 0.3 must focus on architecture, data safety, application security, session recovery, synchronization between editor views, predictable file handling, performance on larger workspaces, diagnostics, and automated testing.

The central release promise is:

> A user can work with several documents for hours, open the same document in both panes, use different modes and scroll positions, close or restart the application, survive a crash or an external file change, and not lose or silently corrupt their work.

---

## 2. Current baseline

The current `0.2.3` implementation has the following relevant characteristics:

- most application state and orchestration live in `src/App.vue`;
- visual Markdown editing lives in `src/VisualMarkdownEditor.vue`;
- source editing lives in `src/SourceEditor.vue`;
- native file and workspace operations live in `src-tauri/src/lib.rs`;
- frontend file calls are wrapped by `src/tauriFiles.ts`;
- workspace paths are passed from the frontend to Rust as strings;
- file saving uses direct `fs::write`;
- dirty state is based on comparing `content` and `savedContent`;
- workspace refresh reads the full directory tree recursively;
- the same document can already be present in both panes, but each pane owns an independent editor instance without an explicit synchronization protocol;
- browser `prompt` and `confirm` dialogs are used for several destructive or blocking operations;
- CSP is disabled;
- there are no automated frontend, Rust, integration, or end-to-end tests;
- there is no autosave, crash recovery, external file watcher, typed error model, or release diagnostics.

The purpose of this specification is not to replace the product direction described in `VISION.md` and `ROADMAP.md`. It defines the concrete engineering scope for release `0.3.0`.

---

## 3. Release goals

### 3.1 Primary goals

1. Protect user documents from partial writes, stale saves, crashes, and accidental closing.
2. Introduce a maintainable application architecture before more product features are added.
3. Preserve and formalize multi-view editing of the same document.
4. Restrict native file access to paths explicitly authorized by the application.
5. Restore the previous workspace and editor session after restart.
6. Detect external file changes and resolve conflicts without silent data loss.
7. Prevent unsafe Markdown conversion in visual mode.
8. Make workspace loading and updates scalable.
9. Add local diagnostics and a predictable error model.
10. Add automated checks that prevent regressions in critical flows.

### 3.2 Secondary goals

- improve startup time through lazy loading;
- preserve line endings and common UTF-8 variants;
- introduce centralized application commands and shortcuts;
- replace native browser dialogs with application dialogs;
- prepare the codebase for future search, command palette, custom blocks, and settings.

---

## 4. Explicit non-goals

The following features are not part of 0.3 unless required internally by this specification:

- backlinks;
- SQLite document indexing;
- slash commands;
- custom Folden blocks;
- plugin API;
- arbitrary split grids;
- horizontal split;
- collaborative network editing;
- cloud synchronization;
- PDF or HTML export;
- full multi-encoding editor support;
- full semantic merge editor;
- full diff viewer;
- table editing in visual mode;
- task list editing in visual mode;
- frontmatter editing UI;
- mobile or web builds.

A minimal conflict comparison view may be added, but a full merge tool is not required.

---

## 5. Engineering principles

### 5.1 Files remain the source of truth

Document content must remain in user-owned files. Internal storage may contain:

- session state;
- recovery snapshots;
- file fingerprints;
- editor view state;
- logs;
- caches.

Internal storage must not become the only copy of a saved document.

### 5.2 Rust owns native trust boundaries

The frontend may request operations, but it must not be treated as the authority for absolute filesystem paths or permissions.

### 5.3 One document, many views

A document is a single shared domain entity. Tabs and panes are views over that document, not separate copies of its content.

The same document may be open:

- in the left and right pane;
- in Visual mode on one side and Source mode on the other;
- at different scroll positions;
- with different selections;
- with independent view state.

All views must remain synchronized through one document model.

### 5.4 No silent data loss

When the application cannot guarantee a safe action, it must stop and ask the user instead of guessing.

### 5.5 Performance work must be measurable

Optimization tasks must include a before and after measurement or an explicit regression test.

---

# 6. Target architecture

## 6.1 Frontend layers

The frontend must be divided into four main layers.

### Domain

Pure TypeScript types and domain rules without Vue dependencies.

Suggested files:

```text
src/domain/
  document.ts
  document-update.ts
  editor-view-session.ts
  workspace.ts
  file-format.ts
  file-error.ts
```

### Stores

Pinia stores that own normalized application state.

Suggested stores:

```text
src/stores/
  documents.store.ts
  workspace.store.ts
  layout.store.ts
  session.store.ts
  settings.store.ts
  notifications.store.ts
```

### Services

Application services that coordinate stores and the Tauri bridge.

```text
src/services/
  filesystem.service.ts
  document-sync.service.ts
  save-queue.service.ts
  recovery.service.ts
  session.service.ts
  commands.service.ts
  dialogs.service.ts
  logger.service.ts
```

### Components

Components render state and emit user intent. They must not implement native filesystem policy.

```text
src/components/
  app/
  editor/
  workspace/
  dialogs/
  notifications/
```

`App.vue` must become a composition root and top-level layout component. It must not remain the owner of all document, workspace, save, and shortcut logic.

---

## 6.2 Normalized document state

Documents must be stored by ID rather than searched repeatedly in an array.

Example:

```ts
export type DocumentId = string
export type EditorViewId = string

export type DocumentState = {
  id: DocumentId
  nativeHandle: string | null

  displayName: string
  displayPath: string | null
  workspaceId: string | null
  relativePath: string | null

  content: string

  revision: number
  persistedRevision: number
  recoveryRevision: number

  saveState: 'idle' | 'queued' | 'saving' | 'saved' | 'error'
  saveError: FileOperationError | null

  fileFormat: TextFileFormat
  diskFingerprint: FileFingerprint | null

  visualModeSafety: MarkdownSafetyReport
}
```

Required invariants:

- `revision` increments after every accepted document content change;
- `persistedRevision` identifies the revision confirmed on disk;
- a document is dirty when `revision !== persistedRevision`;
- `savedContent` must not be kept as a second full string solely to determine dirty state;
- scratch documents have `nativeHandle = null`;
- one document ID identifies one logical document regardless of the number of panes or tabs displaying it.

---

## 6.3 Per-view editor state

Editor state that may differ between panes must not be stored on the document itself.

Example:

```ts
export type EditorViewSession = {
  id: EditorViewId
  documentId: DocumentId
  paneId: 'left' | 'right'
  mode: 'visual' | 'source'

  scrollTop: number
  selectionState: unknown | null
  searchState: unknown | null

  lastAppliedRevision: number
  isFocused: boolean
}
```

Each pane may have its own:

- editor mode;
- scroll position;
- cursor and selection;
- search query;
- fold state;
- viewport state.

Document content, save state, disk fingerprint, and recovery state are shared.

---

# 7. Secure filesystem boundary

## 7.1 Problem

The current frontend passes absolute workspace roots and file paths to Rust. Rust validates that a target path is inside a root that was also supplied by the frontend.

This is not a sufficient long-term trust boundary.

## 7.2 Required design

Rust must issue opaque handles after the user authorizes access through a native file or folder dialog.

Example API:

```text
open_workspace_dialog()
  -> WorkspaceDescriptor

restore_workspace(workspacePersistenceId)
  -> WorkspaceDescriptor | WorkspaceUnavailable

list_directory(workspaceId, relativeDirectory)
  -> WorkspaceEntry[]

open_workspace_document(workspaceId, relativePath)
  -> OpenedDocument

open_external_document_dialog()
  -> OpenedDocument | null

save_document(documentHandle, content, expectedFingerprint)
  -> SaveResult

save_document_as(documentHandle?, content, suggestedName)
  -> SaveResult | null
```

Frontend code must not send an arbitrary absolute path to:

- read a file;
- write a file;
- rename a file;
- create a file;
- create a directory;
- move an item to trash.

## 7.3 Rust application state

Rust should own a registry similar to:

```rust
struct NativeAppState {
    workspaces: HashMap<WorkspaceId, AuthorizedWorkspace>,
    documents: HashMap<DocumentHandle, AuthorizedDocument>,
}
```

A workspace record contains its canonical root path. A document record contains the authorized canonical path or an association with an authorized workspace and relative path.

Opaque IDs may be UUIDs or another collision-resistant identifier.

## 7.4 Path validation requirements

All workspace operations must enforce the following:

- only relative child paths are accepted from the frontend;
- absolute paths are rejected;
- `..` traversal is rejected;
- path separators embedded in names are rejected;
- the workspace root cannot be renamed or moved to trash;
- the canonical parent of a new item must remain inside the workspace;
- symbolic links must not allow escaping outside the authorized workspace;
- rename targets must be validated before execution;
- Windows reserved names must be rejected;
- names ending with a dot or space on Windows must be rejected or normalized only after explicit user confirmation;
- null characters and control characters must be rejected;
- files that disappear between validation and operation must return a typed error.

## 7.5 Security acceptance criteria

- a frontend request cannot read or modify a file outside an authorized workspace or an explicitly opened external file;
- changing a frontend-supplied relative path to `../../...` is rejected;
- a symlink inside a workspace that points outside the workspace cannot be used to access external files;
- the workspace root cannot be trashed;
- authorization is restored after restart only from Rust-owned persisted workspace data;
- all invalid requests return typed errors and do not panic.

---

# 8. Multi-view editing of the same document

## 8.1 Product requirement

Opening the same document in both panes is an intentional Folden feature.

Required use cases:

1. View the beginning of a document on the left and the end on the right.
2. Edit in Source mode on the left while seeing the visual result on the right.
3. Compare two distant sections of one document.
4. Keep different scroll positions and selections.
5. Edit from either pane without creating divergent copies.
6. Save once and persist the latest shared document state.

## 8.2 Canonical model

The canonical in-memory representation for 0.3 remains the Markdown or plain-text string stored in `DocumentState.content`.

Editor instances are projections of that shared value.

Each editor update must include:

```ts
type DocumentUpdate = {
  documentId: DocumentId
  originViewId: EditorViewId
  baseRevision: number
  nextContent: string
  updateKind: 'source-edit' | 'visual-edit' | 'undo' | 'redo' | 'external-reload'
}
```

The document store accepts the update, increments the revision, and broadcasts the resulting state to all other views of that document.

## 8.3 Synchronization rules

1. The originating editor must not reapply its own update.
2. Other views must apply the new revision without emitting a duplicate user update.
3. Every view tracks `lastAppliedRevision`.
4. Updates are processed serially per document.
5. Autosave debounce must not delay synchronization between editor views.
6. Before save, mode switch, close, recovery snapshot, or external conflict resolution, all editor adapters must flush their latest content.
7. A view that receives a revision older than or equal to its current revision ignores it.
8. A stale update based on an older revision must not silently overwrite a newer revision.

## 8.4 Editor adapter contract

Each editor integration must implement a small explicit adapter.

```ts
interface EditorViewAdapter {
  readonly viewId: EditorViewId
  readonly documentId: DocumentId

  applyExternalContent(
    content: string,
    revision: number,
    options: {
      preserveSelection: boolean
      preserveScroll: boolean
      addToHistory: boolean
    },
  ): void

  flushContent(): string

  captureViewState(): EditorViewState
  restoreViewState(state: EditorViewState): void

  focus(): void
  destroy(): void
}
```

The adapter must prevent update loops.

## 8.5 Source to source synchronization

For CodeMirror views:

- use CodeMirror changes or a minimal text diff instead of replacing the full document whenever possible;
- map the current selection through the applied change;
- preserve scroll position;
- mark externally applied changes so they do not emit another domain update;
- external updates must not enter local native history if document-level history is enabled.

## 8.6 Visual to visual synchronization

For Tiptap or ProseMirror views:

- prefer applying compatible ProseMirror steps when both views share the same schema;
- if step synchronization is not practical in the first implementation, use Markdown serialization plus controlled content replacement;
- preserve selection and scroll position where the affected content permits it;
- apply external content with `emitUpdate: false`;
- ensure that replacing content does not create a feedback loop.

## 8.7 Source and Visual synchronization

When one pane is Source and the other is Visual:

- Source edits update canonical Markdown;
- Visual mode reparses the new Markdown;
- Visual edits serialize to canonical Markdown;
- Source mode receives the new text;
- unsupported Markdown safety rules still apply;
- external application must preserve view position as accurately as possible.

For the visual view, exact cursor preservation after a structural source edit may not always be possible. The required fallback order is:

1. restore a mapped document position;
2. restore the nearest valid text position;
3. restore the previous scroll percentage;
4. focus the beginning of the nearest surviving block.

The application must not jump to the start of the document without attempting these fallbacks.

## 8.8 Document-level history

Undo and redo must behave predictably when a document is edited from multiple views.

Required behavior:

- history belongs to the document, not to a pane;
- Ctrl+Z in either pane undoes the latest document edit;
- Ctrl+Shift+Z or Ctrl+Y redoes it;
- external disk reloads do not enter user undo history;
- recovery restore may enter history as one explicit restore operation;
- sequential typing from the same view may be coalesced into one history entry;
- history entries must store reversible text patches or another bounded representation;
- history memory must be limited.

Suggested coalescing rule:

- merge sequential text input from the same view when less than 500 ms has passed and the edit remains adjacent;
- formatting, paste, delete block, mode conversion, and conflict resolution create separate entries.

## 8.9 Multi-view acceptance criteria

- the same document can be visible in both panes;
- one pane may be Visual and the other Source;
- edits from either pane appear in the other without manual save or reload;
- opening the same file twice does not create two document domain objects;
- each pane keeps an independent scroll position;
- each pane keeps an independent selection as far as the editor permits;
- no update loop occurs;
- typing in one pane does not reset the other pane to the top;
- save status is shared;
- one save writes the latest shared revision;
- undo from either pane operates on shared document history;
- closing one view does not ask to discard the document if another view remains open;
- closing the final view of a dirty document triggers the unsaved changes flow.

---

# 9. Safe saving and save queue

## 9.1 Atomic write

Direct replacement through `fs::write` must be removed for existing documents.

Required save sequence:

1. create a temporary file in the same directory;
2. write the complete byte sequence;
3. flush the file;
4. sync file data when supported;
5. atomically replace the target file;
6. preserve required metadata where practical;
7. update the stored fingerprint;
8. report success only after replacement completes.

A failed save must leave the original file intact whenever the platform allows it.

The implementation must be tested specifically on Windows.

## 9.2 Per-document save queue

Each document has its own serialized save queue.

Required model:

```ts
type SaveJob = {
  documentId: DocumentId
  revision: number
  contentSnapshot: string
  expectedFingerprint: FileFingerprint | null
  reason: 'manual' | 'autosave' | 'close' | 'recovery'
}
```

Rules:

- only one native save is in flight per document;
- a save job captures the content for a specific revision;
- when revision 10 is saving and revision 11 appears, revision 11 remains queued;
- completion of revision 10 sets `persistedRevision` to 10, not to the current revision;
- if a newer queued revision exists, it is saved next;
- multiple pending autosave jobs may collapse into the newest revision;
- a manual save always flushes and prioritizes the latest revision;
- errors remain associated with the document;
- a failed autosave does not silently discard future retries;
- global file activity must use an operation counter or operation registry, not one shared boolean.

## 9.3 Save status UI

The status bar and tab state must distinguish:

- modified;
- queued;
- saving;
- saved;
- save failed;
- conflict detected;
- recovered but not yet saved.

The UI must not show `Saved` for revision 10 when the current revision is 11.

## 9.4 Line endings and encoding

0.3 must support:

- UTF-8;
- UTF-8 with BOM;
- LF;
- CRLF.

Opening a file records its format. Saving preserves it unless the user explicitly changes it in a future version.

Files that are not valid supported text must return an `EncodingUnsupported` or `BinaryFile` error.

---

# 10. Autosave

## 10.1 Default behavior

Autosave is enabled by default for documents that already have an authorized file target.

Suggested default delay:

```text
1000 ms after the latest accepted document change
```

The delay must be configurable later, so it must be represented as a setting rather than hardcoded throughout the codebase.

## 10.2 Scratch documents

Unsaved scratch documents must not open a native Save As dialog automatically.

For scratch documents:

- autosave writes recovery snapshots only;
- the tab remains dirty;
- explicit Save or Save As is required to create a user file.

## 10.3 Autosave conditions

Autosave must not overwrite a file when:

- an external conflict exists;
- the file target is no longer available;
- permission has been revoked;
- the document contains unsafe visual conversion changes that require confirmation;
- the application is resolving a rename or path transition.

## 10.4 Autosave acceptance criteria

- typing continuously does not generate one disk write per keypress;
- stopping for the configured delay queues one save of the latest revision;
- edits made during a save are queued for the next save;
- autosave failures are visible;
- manual save still works after an autosave failure;
- scratch documents survive a crash through recovery but are not silently written into an arbitrary folder.

---

# 11. Crash recovery

## 11.1 Recovery storage

Recovery snapshots must be stored in the application data directory, not inside the workspace by default.

A recovery record contains:

```ts
type RecoverySnapshot = {
  recoveryId: string
  documentId: string
  documentHandle: string | null
  workspacePersistenceId: string | null
  relativePath: string | null
  displayName: string

  revision: number
  content: string
  fileFormat: TextFileFormat

  createdAt: string
  appVersion: string
}
```

## 11.2 Snapshot policy

- create or update a snapshot after a dirty change with a short debounce;
- suggested debounce: 2000 ms;
- flush snapshots before application close handling;
- delete the snapshot after the corresponding revision is safely persisted;
- delete the snapshot after explicit discard;
- keep unresolved orphan snapshots for a maximum of 7 days by default;
- cleanup must run on startup without blocking the main UI.

## 11.3 Startup recovery flow

On startup:

1. load the last session;
2. inspect recovery snapshots;
3. compare each snapshot against the disk fingerprint and persisted session revision;
4. automatically discard snapshots already represented by a saved file revision;
5. show a recovery dialog for newer or scratch content;
6. allow Restore, Open as Copy, Discard, and Later.

Restoring must never overwrite the disk file before the user confirms or saves.

## 11.4 Recovery acceptance criteria

- force-killing Folden after typing into a saved document offers the latest recoverable text on restart;
- force-killing Folden with an unsaved scratch document restores it;
- successfully saved revisions do not reappear as false recovery candidates;
- discarding a recovery snapshot removes it;
- recovery data is not kept indefinitely;
- malformed recovery files do not crash startup.

---

# 12. External file changes

## 12.1 Watcher

Use a native filesystem watcher in Rust.

Requirements:

- watch open document files;
- watch relevant workspace directories for tree updates;
- debounce duplicate platform events;
- distinguish application writes from external writes using fingerprints;
- recover from watcher overflow or invalidation through a controlled rescan.

## 12.2 File fingerprint

A fingerprint should include enough data to identify stale writes.

Example:

```ts
type FileFingerprint = {
  modifiedAtNs: number | null
  size: number
  contentHash: string | null
}
```

A content hash may be computed only when timestamp and size checks are insufficient.

## 12.3 Clean document behavior

When a file changes externally and the in-memory document is clean:

- reload the content;
- increment the document revision;
- update all views;
- preserve view state where possible;
- show a non-blocking notification.

## 12.4 Dirty document behavior

When a file changes externally and the in-memory document is dirty:

- stop autosave;
- mark the document as conflicted;
- show a conflict dialog;
- do not overwrite either version automatically.

Required actions:

1. **Reload from disk**
   - replaces in-memory content;
   - creates an undoable document history entry;
   - removes the conflict.

2. **Keep Folden version**
   - keeps current content;
   - requires explicit overwrite confirmation;
   - updates the expected disk fingerprint before save.

3. **Save as new file**
   - opens Save As;
   - preserves the external file unchanged.

A full merge editor is not required.

## 12.5 Rename and delete handling

When an open file is renamed inside Folden:

- its document handle and relative path are updated;
- all views remain open;
- session and watcher state are updated;
- save queue jobs use the new target.

When an open file is renamed externally:

- attempt to identify the rename through watcher metadata;
- if identified, update the document path;
- otherwise mark the file as missing and offer Locate, Save As, or Close.

When an open file is deleted externally:

- keep the in-memory content;
- mark the document as missing;
- disable autosave to the missing target;
- offer Save As, Recreate, or Close.

---

# 13. Session persistence

## 13.1 Persisted state

The following state must be restored:

- last workspace;
- recent workspaces;
- open documents;
- scratch documents through recovery references;
- tab order;
- active tab in each pane;
- split enabled state;
- document mode per view;
- pane widths;
- scroll position per view;
- selection where serializable and stable;
- active pane;
- window size and position when supported.

Document content must not be duplicated into the session file. Dirty content belongs in recovery snapshots.

## 13.2 Persistence rules

- session state is saved with a short debounce after layout changes;
- suggested debounce: 500 ms;
- final session state is flushed during normal shutdown;
- paths persisted by Rust must be revalidated on restore;
- unavailable workspaces must not crash startup;
- missing documents remain visible as unavailable tabs only when a recovery snapshot exists or the user can meaningfully resolve them.

## 13.3 Session acceptance criteria

After normal restart:

- the previous workspace reopens;
- the same documents and tabs reopen;
- the split layout is restored;
- the same document may reopen in both panes;
- each pane restores its mode and scroll position;
- unavailable paths produce a recoverable UI state instead of an exception.

---

# 14. Closing and destructive actions

## 14.1 Application close

Closing the main window must be intercepted when any document is:

- dirty;
- saving;
- queued;
- conflicted;
- recovered but unsaved;
- missing its original target.

Required dialog actions:

- Save All;
- Review;
- Discard All;
- Cancel.

`Save All` waits for all required save queues to finish. The application closes only after success or after the user explicitly resolves errors.

## 14.2 Closing tabs and views

A tab represents a view. Closing one tab must not close the shared document if another view still references it.

Rules:

- closing one of several views requires no unsaved warning;
- closing the final view of a dirty document opens the document close dialog;
- closing a pane transfers or closes its views according to an explicit layout action;
- disabling split view must preserve all documents and merge views predictably;
- duplicate views of the same document may collapse into one view only after preserving the chosen active mode and view state.

## 14.3 Replace browser dialogs

Replace `window.prompt` and `window.confirm` with application dialogs for:

- new file;
- new folder;
- rename;
- move to trash;
- close dirty document;
- close application;
- external conflict;
- recovery;
- unsupported visual Markdown;
- open large file.

Dialogs must support keyboard navigation, focus trapping, Enter, Escape, and screen-reader labels.

---

# 15. Workspace tree scalability

## 15.1 Lazy directory loading

The workspace tree must not recursively scan the full workspace when opened.

Required API:

```text
list_directory(workspaceId, relativeDirectory)
  -> immediate children only
```

A directory loads its children when expanded.

Each entry must expose:

```ts
type WorkspaceEntry = {
  id: string
  name: string
  relativePath: string
  kind: 'file' | 'directory'
  hasChildren: boolean | null
}
```

## 15.2 Targeted updates

- saving an existing file must not refresh the workspace tree;
- creating a file refreshes or patches only the parent directory;
- creating a directory refreshes or patches only the parent directory;
- renaming patches the affected entry and descendants;
- moving to trash removes the affected entry;
- watcher events update only affected branches;
- expanded and collapsed state survives refreshes.

## 15.3 Ignore rules

0.3 must include a basic ignore configuration.

Default ignored directories:

```text
.git
node_modules
dist
build
target
.cache
```

The architecture must allow future workspace-specific ignore settings.

## 15.4 Large directories

For directories with many children:

- rendering must not block the UI;
- incremental rendering or list virtualization must be considered when the child count exceeds a defined threshold;
- suggested threshold: 500 visible entries;
- a directory read must be cancellable or safely ignored if the workspace changes before completion.

## 15.5 Workspace acceptance criteria

- opening a workspace does not recursively read all descendants;
- a workspace containing many nested files opens quickly when the root directory itself is small;
- saving a file does not rescan the tree;
- renaming an open directory updates paths for all open descendant documents;
- collapsing and expanding folders remains stable after watcher updates.

---

# 16. Text file detection and large files

## 16.1 File type detection

The workspace tree must not rely only on a short hardcoded extension list.

Required approach:

- known text extensions are treated as text;
- extensionless files may be inspected;
- binary detection checks for null bytes and invalid encoding within a bounded sample;
- unsupported binary files are not opened in the text editor;
- the UI may still show unsupported files with a distinct icon if future behavior requires it.

At minimum, include common formats relevant to Folden users:

```text
md, markdown, txt, csv, json, jsonc, yaml, yml, toml, ini, cfg,
js, jsx, ts, tsx, vue, css, scss, html, xml,
rs, py, gd, shader, glsl, c, h, cpp, hpp, java, cs,
sh, bash, ps1, bat, gitignore, env
```

This list is a hint, not the security boundary.

## 16.2 Size thresholds

Define configurable constants in one place.

Suggested defaults:

- up to 1 MB: normal Visual or Source opening;
- above 1 MB: default Markdown files to Source mode and show a notice;
- above 10 MB: require confirmation before opening;
- above 50 MB: block normal opening unless the user explicitly chooses Open Anyway;
- Visual mode may be disabled for files above the visual threshold.

Thresholds may be adjusted after profiling.

## 16.3 Large file behavior

- file size is checked before full read;
- loading can be cancelled;
- the UI remains responsive;
- CodeMirror is preferred;
- Tiptap is not instantiated for files over the visual threshold;
- character counts and expensive derived data are throttled;
- autosave does not serialize or duplicate unnecessary full content more often than required.

---

# 17. Markdown visual-mode safety

## 17.1 Problem

Tiptap currently supports only a subset of Markdown. Opening and saving unsupported syntax through Visual mode may normalize or remove information.

Potentially unsafe features include:

- frontmatter;
- tables;
- task lists;
- footnotes;
- raw HTML;
- comments;
- custom directives;
- unknown fenced blocks;
- custom Folden syntax added later.

## 17.2 Safety report

Before entering Visual mode, analyze the Markdown and produce:

```ts
type MarkdownSafetyReport = {
  safeForVisualEditing: boolean
  unsupportedFeatures: Array<{
    kind: string
    line: number | null
    description: string
  }>
}
```

## 17.3 Required behavior

- safe Markdown may open in Visual mode;
- unsafe Markdown opens in Source mode by default;
- the user may choose Open in Visual Anyway;
- the warning lists unsupported constructs;
- autosave must not silently overwrite a file after a lossy conversion that has not been acknowledged;
- acknowledgment applies to the current document revision or session, not permanently to all files;
- switching back to Source must expose the actual canonical Markdown that would be saved.

## 17.4 Round-trip tests

Create fixtures for every supported construct:

- paragraphs;
- headings;
- bold;
- italic;
- strike;
- inline code;
- bullet lists;
- ordered lists;
- nested lists;
- blockquotes;
- fenced code blocks;
- links;
- images;
- horizontal rules;
- Unicode;
- CRLF and LF input.

The test compares semantic Markdown structure. Harmless whitespace normalization may be accepted. Loss of content or structure is not accepted.

Unsafe fixtures must verify that the safety detector blocks automatic Visual opening.

---

# 18. Content Security Policy and remote resources

## 18.1 CSP

CSP must no longer be `null` in production.

The final policy must:

- allow application scripts only from the application bundle;
- disallow `eval`;
- disallow arbitrary frames and objects;
- restrict network connections;
- restrict image sources;
- restrict navigation to untrusted schemes;
- account for Tauri IPC and asset schemes required by the application.

An indicative policy may resemble:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' asset: data: https: http:;
connect-src 'self' ipc: http://ipc.localhost;
object-src 'none';
frame-src 'none';
base-uri 'none';
```

The exact Tauri-compatible values must be verified in development and release builds.

## 18.2 Link validation

Before storing or opening a link:

- trim whitespace;
- reject `javascript:`;
- reject executable or unknown schemes;
- allow a controlled set such as `http`, `https`, `mailto`;
- handle relative Markdown links separately;
- use the OS browser only after explicit user action.

## 18.3 Remote images

Remote images in Markdown must not load automatically by default.

Required behavior:

- render a placeholder for remote images;
- offer Load Remote Images for this document;
- allow a future global setting;
- local workspace images use a controlled Tauri asset mechanism;
- image loading failures do not break the editor;
- opening a document does not silently make remote requests.

## 18.4 HTML safety

If raw HTML support is added later, it must remain disabled in Visual mode until an explicit sanitization design exists.

---

# 19. Typed errors and user feedback

## 19.1 Native error model

Rust commands must return serializable typed errors.

Example:

```rust
enum FileErrorCode {
    NotFound,
    PermissionDenied,
    OutsideWorkspace,
    InvalidName,
    AlreadyExists,
    EncodingUnsupported,
    BinaryFile,
    TooLarge,
    FileChangedExternally,
    TargetMissing,
    DiskFull,
    WatcherUnavailable,
    Unknown,
}
```

Example payload:

```ts
type NativeError = {
  code: FileErrorCode
  operation: string
  userMessage: string
  technicalMessage: string | null
  retryable: boolean
}
```

## 19.2 UI behavior

The frontend maps error codes to actions:

- Retry;
- Save As;
- Locate;
- Reload;
- Open logs;
- Dismiss.

Errors must not be assembled through repeated string prefixes.

## 19.3 Notifications

Introduce:

- transient toasts for successful or recoverable events;
- persistent banners for conflicts and save failures;
- blocking dialogs only for decisions that cannot be deferred.

---

# 20. Local diagnostics and logging

## 20.1 Release logging

Enable bounded local logging in production.

Requirements:

- logs remain on the local device;
- log rotation;
- maximum total size;
- `warn` and `error` by default;
- application version;
- OS and architecture;
- operation names and error codes;
- no document content;
- no full user paths by default;
- redact or hash sensitive path segments;
- panic hook for Rust;
- uncaught frontend error handler.

## 20.2 User access

Add an application action:

```text
Help -> Open Logs Folder
```

A future bug report action may collect logs only after explicit confirmation.

## 20.3 Recovery privacy

Recovery snapshots may contain user text, so:

- their storage location must be documented;
- retention must be bounded;
- successful save or explicit discard removes them;
- logs must never include snapshot content.

---

# 21. Commands and shortcuts

## 21.1 Command registry

Replace the growing global keyboard `if` chain with a central command registry.

Example:

```ts
registerCommand({
  id: 'document.save',
  title: 'Save Document',
  defaultShortcut: 'Mod+S',
  canExecute: context => context.activeDocumentId !== null,
  execute: context => context.documents.save(context.activeDocumentId),
})
```

Commands must be reusable by:

- toolbar buttons;
- menus;
- shortcuts;
- future command palette;
- future plugin API.

## 21.2 Required commands for 0.3

```text
document.new
document.open
document.save
document.saveAs
document.saveAll
document.closeView
document.closeAll
document.undo
document.redo

workspace.open
workspace.newFile
workspace.newFolder
workspace.rename
workspace.trash
workspace.refreshDirectory

layout.toggleSplit
layout.moveViewLeft
layout.moveViewRight
layout.focusLeft
layout.focusRight

editor.toggleMode
editor.find
```

`editor.find` may use editor-native search in 0.3 even if a unified search panel is postponed.

## 21.3 Shortcut handling

- physical key handling must continue to work across keyboard layouts;
- editor-native shortcuts must not be stolen unintentionally;
- command availability must be checked before execution;
- shortcuts are represented in one registry;
- future customization must not require rewriting components.

---

# 22. Lazy loading and performance

## 22.1 Editor bundles

CodeMirror and Tiptap must be loaded lazily.

Suggested approach:

```ts
const SourceEditor = defineAsyncComponent(
  () => import('./components/editor/SourceEditor.vue'),
)

const VisualMarkdownEditor = defineAsyncComponent(
  () => import('./components/editor/VisualMarkdownEditor.vue'),
)
```

A plain-text document should not require the Visual editor bundle before it is needed.

## 22.2 Expensive derived state

Avoid recalculating full-document values on every template render.

Examples:

- character and word counts should be throttled for large documents;
- document lookup must use maps;
- Markdown safety analysis should cache by revision;
- serialization must not happen multiple times for the same revision;
- tree searches must not recursively traverse the full workspace on every interaction.

## 22.3 Performance measurements

Record at minimum:

- cold application startup time;
- frontend bundle sizes;
- time to open a 100 KB Markdown file;
- time to open a 1 MB Markdown file in Source;
- time to switch Source to Visual for a supported document;
- typing latency in a 1 MB Source document;
- time to open a workspace without recursive scan;
- memory with one document open in one and two panes.

No hard universal number is mandated before baseline measurements exist. A change is rejected if it produces a clear regression without a documented reason.

---

# 23. Testing strategy

## 23.1 Frontend unit tests

Use Vitest.

Required coverage:

- document revision rules;
- dirty state;
- save queue ordering;
- save queue collapsing;
- multi-view update routing;
- update loop prevention;
- view close versus document close;
- session serialization;
- recovery candidate resolution;
- typed error mapping;
- command availability;
- Markdown safety detection;
- path-independent display logic.

## 23.2 Editor integration tests

Test adapters with real editor instances where practical.

Required scenarios:

- Source view applies an external change without emitting a duplicate update;
- Visual view applies an external change without emitting a duplicate update;
- two Source views remain synchronized;
- two Visual views remain synchronized;
- Source and Visual views remain synchronized;
- scroll state is not reset unnecessarily;
- selection fallback works after structural changes;
- switching modes flushes the current revision;
- undo and redo operate on document history.

## 23.3 Rust unit and integration tests

Required coverage:

- path traversal rejection;
- absolute path rejection;
- symlink escape rejection;
- workspace root protection;
- Windows invalid name validation;
- create file;
- create directory;
- rename;
- trash;
- text and binary detection;
- UTF-8 BOM handling;
- LF and CRLF preservation;
- atomic save success;
- atomic save failure leaves original content intact;
- stale fingerprint conflict;
- missing file;
- permission failure;
- typed error serialization;
- watcher event normalization.

Use temporary directories for filesystem tests.

## 23.4 Recovery tests

Required scenarios:

1. Dirty saved document, process terminated, restart, restore available.
2. Dirty scratch document, process terminated, restart, restore available.
3. Saved revision, stale snapshot remains, startup discards it.
4. Corrupt recovery record, startup continues.
5. Recovery restore does not overwrite disk automatically.
6. Recovery retention cleanup removes expired snapshots.

## 23.5 External change tests

Required scenarios:

- clean file modified externally;
- dirty file modified externally;
- file renamed externally;
- file deleted externally;
- application save generates watcher events but no false conflict;
- two rapid external writes are debounced;
- watcher unavailable produces a visible degraded state.

## 23.6 End-to-end tests

Use Playwright for browser-level UI flows with a mocked filesystem service.

Required flows:

- open workspace;
- lazy expand directory;
- open file;
- edit and save;
- open same document in both panes;
- use Visual on one side and Source on the other;
- close one view while the other remains;
- close final dirty view;
- conflict dialog;
- recovery dialog;
- application dialogs keyboard navigation;
- command shortcuts.

Native Tauri smoke tests may remain manual in 0.3 if full desktop automation is not practical, but all core domain logic must be automated outside the native shell.

## 23.7 Manual Windows smoke test

Run on a release-like Windows build:

1. Open a workspace.
2. Open several Markdown and text files.
3. Open one document in both panes.
4. Set one pane to Visual and one to Source.
5. Scroll to different document sections.
6. Edit from both panes.
7. Undo and redo from both panes.
8. Wait for autosave.
9. Modify the file in another editor.
10. Resolve the conflict through each available action.
11. Force-kill Folden and restore the document.
12. Rename an open file and folder.
13. Move an open file to trash.
14. Reopen Folden and verify session restoration.
15. Test a large file.
16. Test a file with unsupported Markdown.
17. Test remote images with network loading disabled.
18. Verify logs contain no document text.

---

# 24. Build, CI, and release process

## 24.1 Required npm scripts

Add:

```json
{
  "scripts": {
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "...",
    "format": "...",
    "format:check": "...",
    "build": "npm run typecheck && vite build"
  }
}
```

The exact lint and format tools may be selected during implementation, but CI commands must be deterministic.

## 24.2 Rust checks

CI must run:

```text
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## 24.3 GitHub Actions

At minimum, add a Windows workflow that runs:

1. `npm ci`
2. frontend typecheck
3. frontend unit tests
4. frontend build
5. Rust format check
6. Rust clippy
7. Rust tests
8. Tauri build without publishing an installer

A faster Linux frontend job may be added, but Windows remains the release target for 1.0 and must be covered.

## 24.4 Version synchronization

Create one release script that updates:

- `package.json`;
- `package-lock.json`;
- `src-tauri/tauri.conf.json`;
- `src-tauri/Cargo.toml`;
- `src-tauri/Cargo.lock` when needed;
- `CHANGELOG.md`.

The script must fail if versions are inconsistent.

## 24.5 Cargo metadata

Update placeholder metadata:

- package name;
- description;
- authors;
- license choice;
- repository URL.

---

# 25. Suggested implementation sequence

## Phase 1. Architecture foundation

- add Pinia;
- introduce domain types;
- normalize document state;
- split stores and services;
- reduce `App.vue`;
- add command registry;
- add typed frontend error model;
- add unit test infrastructure.

**Exit criteria:** existing 0.2 behavior still works and frontend tests run.

## Phase 2. Native authorization and safe filesystem API

- introduce Rust application state;
- issue workspace and document handles;
- convert workspace operations to relative paths;
- add path and symlink security checks;
- implement typed Rust errors;
- add Rust tests.

**Exit criteria:** frontend can no longer request arbitrary absolute file operations.

## Phase 3. Multi-view document synchronization

- introduce editor view sessions;
- implement editor adapters;
- implement shared document revision pipeline;
- preserve independent scroll and selection;
- implement shared document history;
- cover Source-Source, Visual-Visual, and Source-Visual combinations.

**Exit criteria:** the same document can be edited safely in both panes.

## Phase 4. Atomic saves and save queues

- implement atomic native write;
- add fingerprints;
- add per-document save queues;
- expose accurate save states;
- preserve encoding and line endings.

**Exit criteria:** stale save completion cannot overwrite a newer in-memory revision, and failed writes preserve the original file.

## Phase 5. Autosave, recovery, close protection

- add autosave settings and debounce;
- add recovery snapshots;
- add startup recovery UI;
- intercept application close;
- replace dirty close browser dialogs.

**Exit criteria:** crash and close scenarios pass automated and manual tests.

## Phase 6. External watcher and conflict handling

- add native file watcher;
- ignore self-generated events;
- update clean documents;
- block dirty conflicts;
- handle external rename and delete.

**Exit criteria:** external changes never produce silent overwrite.

## Phase 7. Workspace and performance work

- lazy tree loading;
- targeted updates;
- ignore rules;
- large directory handling;
- lazy editor bundles;
- large file thresholds;
- measurements.

**Exit criteria:** opening a workspace does not recursively scan all descendants.

## Phase 8. Security and Markdown safety

- enable CSP;
- validate links;
- disable remote image loading by default;
- add Markdown safety detector;
- add round-trip fixtures.

**Exit criteria:** unsafe Markdown cannot be silently rewritten through automatic Visual mode.

## Phase 9. Diagnostics, CI, and release hardening

- release logs;
- panic and frontend error handlers;
- GitHub Actions;
- version release script;
- metadata cleanup;
- full smoke test;
- changelog and documentation update.

**Exit criteria:** all automated checks pass and the release candidate completes the manual acceptance matrix.

---

# 26. Detailed release acceptance criteria

Release `0.3.0` is accepted only when all items below are true.

## Data safety

- existing files are saved atomically;
- an interrupted save does not leave a truncated original file in tested failure scenarios;
- save jobs are ordered per document;
- stale jobs cannot mark a newer revision as saved;
- autosave errors are visible;
- dirty content survives a forced process termination;
- scratch content survives a forced process termination;
- closing the application cannot silently discard dirty documents;
- external modifications cannot be overwritten without explicit resolution.

## Multi-view editing

- one document may be open in both panes;
- each pane has an independent mode;
- each pane has an independent scroll position;
- each pane has an independent selection where technically possible;
- edits propagate both directions;
- no duplicate domain documents are created;
- no feedback loop occurs;
- saving from either pane saves the shared latest revision;
- undo and redo use shared document history;
- closing one view does not close or discard the shared document.

## Security

- frontend absolute paths are not accepted for native workspace operations;
- traversal and symlink escape tests pass;
- workspace root cannot be trashed;
- CSP is enabled in production;
- dangerous link schemes are rejected;
- remote images do not load automatically;
- logs contain no document content.

## Stability

- session restoration works after normal restart;
- malformed session or recovery data does not crash startup;
- watcher degradation is visible;
- missing and renamed files enter recoverable states;
- browser `prompt` and `confirm` are removed from production flows covered by this specification;
- typed errors are displayed through consistent UI.

## Performance

- workspace opening does not recursively enumerate the complete tree;
- saving does not rescan the workspace;
- CodeMirror and Tiptap are lazy-loaded;
- large Markdown defaults to Source;
- measured startup and editor benchmarks are recorded in the repository;
- no severe typing lag appears in the agreed large-file smoke fixtures.

## Quality

- frontend typecheck passes;
- frontend tests pass;
- frontend production build passes;
- Rust format check passes;
- Rust clippy passes with warnings denied;
- Rust tests pass;
- Windows CI passes;
- manual Windows smoke test passes;
- version numbers are synchronized;
- changelog and documentation are updated.

---

# 27. Definition of Done

A task in the 0.3 scope is complete only when:

1. implementation is merged;
2. domain behavior is covered by tests;
3. errors and edge cases are handled;
4. no user document content is logged;
5. the relevant acceptance scenario is documented;
6. existing 0.2 flows still work;
7. code does not reintroduce absolute path authority into the frontend;
8. UI state and native state remain consistent after failure;
9. documentation is updated when public behavior changes.

The release itself is complete only when every mandatory acceptance criterion in section 26 is satisfied.

---

# 28. Proposed 0.3 release description

## Folden 0.3 - Reliable Editing

Folden 0.3 focuses on making the editor safe for everyday work.

The release adds reliable autosave, crash recovery, session restoration, external file-change detection, atomic file saving, safer native filesystem access, and improved handling of large workspaces and files.

The same document can now be opened in both editor panes at once. Each pane keeps its own mode, selection, and scroll position while sharing one synchronized document state. This allows a document to be viewed at different positions or edited in Source and Visual modes side by side.

The application architecture has been separated into domain models, stores, services, editor adapters, and native filesystem APIs. The release also introduces typed errors, local diagnostics, Content Security Policy, Markdown safety checks, lazy workspace loading, automated tests, and Windows CI.

The goal of 0.3 is simple: Folden should not merely be usable. It should be trustworthy.
