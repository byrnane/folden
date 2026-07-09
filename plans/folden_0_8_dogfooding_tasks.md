# Folden 0.8 Dogfooding Fixes Plan

## Summary

0.8 focuses on real dogfooding friction: distinguishable tabs, clearer workspace tree state, workspace-level ignores, outline navigation, and document map navigation.

Current repo baseline: `0.7.2`.

## Key Changes

### 0.8-01 - Unique tab and Open Editors labels

**Goal:** If several open files have the same name, the user can distinguish them without hovering.

**Tasks:**

- Add a small domain/UI helper that builds minimal unique labels for open documents with duplicate `name`.
- Prefer `relativePath` for workspace documents; fall back to cleaned absolute path for external files; keep scratch documents as their existing scratch names.
- Add path segments from nearest parent outward until duplicate labels become unique.
- Use the label in editor tabs and Open Editors rows.
- Keep the full cleaned path in `title`.

**Acceptance:**

- `folder 1\Scenario.md` and `folder 2\Scenario.md` show as `folder 1/Scenario.md` and `folder 2/Scenario.md`.
- `scripts\folder 1\Scenario.md` and `scripts\folder 2\Scenario.md` show enough shared parent context to stay readable and unique.
- Non-duplicate filenames still show only the filename.

### 0.8-02 - Muted folders without openable files

**Goal:** The workspace tree should make folders with no editor-openable files visually less important.

**Tasks:**

- Extend `WorkspaceEntry` with `hasOpenableDescendants: boolean`.
- Compute the flag in native `list_directory` using the same openable text-file extension policy as the workspace tree.
- Keep folders visible, but apply muted styling when they have no openable descendants.
- Add a tooltip explaining that the folder has no supported files.
- Ensure this works together with global ignored names and workspace ignored paths.

**Acceptance:**

- A folder that contains only unsupported files is visible but muted.
- A folder that contains at least one supported file, including nested supported files, is normal.
- Filtering ignored files/folders updates the muted state after refresh.

### 0.8-03 - Compact sidebar action buttons

**Goal:** Compact mode should follow the app-wide icon-only button convention.

**Tasks:**

- In compact activity/sidebar mode, force workspace action buttons to hide labels.
- Keep `title` and `aria-label` for `New scratch document`, `New file`, and `New folder`.
- Preserve existing labelled layout in expanded mode.

**Acceptance:**

- In compact mode, the sidebar action row shows icons only.
- Screen-reader names and hover tooltips remain available.
- Expanded mode keeps labels where width allows.

### 0.8-04 - Workspace settings file

**Goal:** Store workspace-specific settings in the workspace itself when needed.

**Tasks:**

- Add hidden service folder `.folden` at workspace root.
- Add workspace settings file `.folden/workspace.json`.
- Create the folder/file only when the first workspace setting must be saved.
- Define minimal schema:

```json
{
  "ignoredPaths": []
}
```

- Add native commands to load and save workspace settings for the authorized workspace.
- Validate loaded settings; invalid or malformed files should surface a clear warning and fall back to empty workspace settings.
- Hide `.folden` from the workspace tree by default.

**Acceptance:**

- Opening a workspace without workspace settings does not create `.folden`.
- Saving the first ignored path creates `.folden/workspace.json`.
- Reopening the workspace restores workspace ignored paths.
- Malformed settings do not crash the app.

### 0.8-05 - Workspace ignore UI

**Goal:** Let the user hide noisy files and folders from the workspace tree.

**Tasks:**

- Add tree action `Hide from workspace` for files and folders.
- Store ignored entries as normalized relative paths in `.folden/workspace.json`.
- Merge filtering from global `appSettings.workspace.ignoredNames` and workspace `ignoredPaths`.
- Refresh the nearest loaded branch after ignore changes.
- Clear selection if the ignored item was selected.
- Do not close already open documents; ignore affects tree visibility only.

**Acceptance:**

- Hiding a file removes it from the tree and writes the relative path to workspace settings.
- Hiding a folder removes the folder subtree from the tree.
- Already open documents remain open after their path is ignored.
- Ignored paths stay hidden after app restart or workspace reopen.

### 0.8-06 - Outline sidebar

**Goal:** Add document outline navigation for Markdown files.

**Tasks:**

- Parse Markdown headings `#` through `######` from document content.
- Add an outline sidebar inside each editor pane, left of the document text.
- Allow resizing with persisted width bounds `160-360px`, default `220px`.
- Visual mode should reuse existing heading anchor/scroll behavior.
- Source mode should scroll to the heading line through CodeMirror.
- Hide the outline sidebar when the active Markdown document has no headings.

**Acceptance:**

- Markdown headings appear in document order with visible nesting by heading level.
- Clicking an outline item scrolls Visual and Source modes to the heading.
- Width resize is clamped and persisted.
- Plain text files do not show outline.

### 0.8-07 - Document map

**Goal:** Add a VS Code-style document map next to the editor scrollbar for long Markdown documents.

**Tasks:**

- Add a document map on the right side of each editor pane, next to the document scroll area.
- Use bounds `48-96px`, default `64px`.
- Source mode should use CodeMirror document content and line metrics for a minimap-like preview.
- Visual mode should use a simplified structure preview based on blocks/headings/list density, without mutating editor content.
- Support click and drag on the map to scroll the document.
- Keep the native/editor scrollbar usable.

**Acceptance:**

- Long Markdown documents show a right-side document map in Visual and Source modes.
- Clicking or dragging the map changes scroll position.
- The map updates after document edits.
- Short documents may show a minimal map or hide it if there is no useful scroll range.

## Public Interfaces

- `WorkspaceEntry` adds `hasOpenableDescendants: boolean`.
- Add domain type `WorkspaceSettings = { ignoredPaths: string[] }`.
- `WorkspaceFilePort` adds:
  - `loadWorkspaceSettings(workspaceId): Promise<WorkspaceSettings>`
  - `saveWorkspaceSettings(workspaceId, settings): Promise<void>`
- Editor adapter/navigation should expose the minimum needed hooks for outline and map scrolling, without moving editor-specific behavior into app shell state.

## Test Plan

- Unit: unique labels for duplicate filenames in same and different folders.
- Unit: workspace filtering merges global ignored names with workspace ignored relative paths.
- Unit: heading extraction handles `#` through `######`, duplicate headings, empty headings, and fenced code blocks.
- Rust tests: `WorkspaceEntry.hasOpenableDescendants`, `.folden` hidden, workspace settings read/write validation.
- Contract tests: update `WorkspaceEntry` fixture for the new field.
- E2E: duplicate `Scenario.md` tabs show unique visible labels.
- E2E: compact sidebar action buttons are icon-only with accessible names.
- E2E: `Hide from workspace` removes an item from tree after reload and does not close an already open document.
- E2E: outline renders headings and clicking a heading scrolls Visual and Source modes.
- E2E/manual smoke: document map appears and click/drag scrolls long Markdown in both modes.
- Release gate: `npm run quality`, `npm run test:e2e`, `npm run app:build`.

## Assumptions

- This work is planned as `0.8` because the current repository version is `0.7.2`.
- Workspace settings path is fixed as `.folden/workspace.json`.
- Ignore uses exact relative paths, not glob patterns, for the first version.
- Folders without openable files are muted, not hidden.
- Outline and document map target Markdown documents first.
