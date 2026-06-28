# Folden Post-0.3 Technical Debt Plan

**Purpose:** collect the parts of `specs/FOLDEN_V0.3_SPEC.md` that were intentionally left out of `specs/FOLDEN_V0.3_IMPLEMENTATION_PLAN.md`.

This plan starts after the 0.3 reliability core is complete. Do not begin these tasks before the main 0.3 plan has delivered safe filesystem access, shared document state, atomic saves, recovery, watcher, Markdown safety, diagnostics, and tests.

## Debt Scope

The work below is not rejected. It is deferred because it is platform maturity, polish, or extensibility work rather than the minimum reliability core.

Deferred from the original specification:

- full four-layer frontend architecture with complete `domain`, `stores`, `services`, and `components` separation;
- full Pinia store set;
- complete command registry and all proposed commands;
- command palette-ready command infrastructure;
- guaranteed document-level undo/redo if the 0.3 prototype is postponed or limited;
- ProseMirror-step synchronization between Visual editors;
- autosave to original files;
- full diff/merge conflict editor;
- full Playwright E2E suite;
- native Tauri desktop automation;
- complete performance benchmark matrix;
- workspace-specific ignore settings;
- full settings system;
- complete remote image UX and future global setting;
- bug report package flow;
- full release/version automation beyond the 0.3 hardening minimum;
- semantic Markdown round-trip comparator beyond fixture coverage.

## Task D1. Complete Frontend Layer Separation

### Goal and Dependencies

Move from the incremental 0.3 reliability architecture to the intended long-term frontend structure.

Depends on the main 0.3 plan being complete.

### Scope

- Split stable domain rules, Vue stores, application services, and UI components.
- Introduce Pinia stores where they reduce state ownership ambiguity.
- Keep document content, view state, workspace state, session state, notifications, settings, and dialogs under clear owners.
- Reduce `App.vue` to composition root, layout shell, and high-level orchestration.

### Non-goals

- Do not change product behavior during this refactor.
- Do not introduce new editor features.
- Do not rewrite working reliability logic unless ownership boundaries require it.

### Current Expected State After 0.3

- Some domain modules and services already exist.
- `App.vue` is smaller but may still own layout-specific orchestration.
- Reliability behavior is covered by tests.

### Touched Areas

- `src/domain/`
- `src/stores/`
- `src/services/`
- `src/components/`
- `src/App.vue`
- frontend tests

### Approach

- Move one ownership area at a time.
- Keep tests green after each extraction.
- Prefer Pinia for shared app state, not for local component state.
- Preserve public component props/events until a task explicitly replaces them.

### Acceptance Criteria

- `App.vue` no longer owns document, workspace, save, recovery, watcher, dialog, and command business rules.
- Each major state area has one owner.
- Existing 0.3 acceptance flows still pass.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual smoke for open/edit/save/recovery/watcher flows.

### Stop Conditions

- Stop if behavior changes become mixed with refactor work.
- Stop if a store duplicates state already owned by a service without a clear synchronization rule.

## Task D2. Finish Command Registry And Shortcut Model

### Goal and Dependencies

Make commands reusable by toolbar buttons, menus, shortcuts, and a future command palette.

Depends on Task D1 or on a stable post-0.3 command foundation.

### Scope

- Define a central command registry.
- Move all global shortcut behavior into command execution.
- Add availability checks for every command.
- Represent shortcuts in one place.
- Add the full command set proposed in the original spec where product behavior exists.

### Non-goals

- Do not build the command palette UI in this task.
- Do not add plugin APIs.
- Do not invent commands for features that do not exist yet.

### Current Expected State After 0.3

- Save/open/close/split and dialog flows may have minimal command wrappers.
- Some editor-native shortcuts still belong to CodeMirror or Tiptap.

### Touched Areas

- command service/registry
- shortcut handling
- toolbar/menu call sites
- tests

### Approach

- Register only executable commands.
- Let editor-native commands keep priority where stealing shortcuts would harm typing/editing.
- Include tests for command availability and shortcut routing.

### Acceptance Criteria

- Buttons and shortcuts call the same command implementation.
- Disabled commands cannot execute through shortcuts.
- Physical-key handling continues to work across keyboard layouts.
- The registry is ready for a future command palette without another shortcut rewrite.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual keyboard smoke in Visual and Source modes.

### Stop Conditions

- Stop if editor-native shortcuts conflict with app commands and need product decisions.

## Task D3. Ship Full Document-Level Undo/Redo If Prototype Was Deferred

### Goal and Dependencies

Complete shared document undo/redo if the 0.3 prototype did not fully ship it.

Depends on the result of main plan Task 6.

### Scope

- Implement bounded document-level history for shared document state.
- Coalesce sequential text input where safe.
- Keep undo/redo consistent across both panes.
- Exclude external reloads from user history.
- Treat recovery restore and conflict resolution as explicit history entries where useful.

### Non-goals

- Do not implement semantic merge history.
- Do not store unbounded full-document snapshots.
- Do not break editor-native composition or IME behavior.

### Current Expected State After 0.3

- Either shared undo/redo exists in limited form, or the prototype documented why it was postponed.

### Touched Areas

- document history domain
- editor adapters
- command registry
- tests

### Approach

- Reuse the prototype outcome.
- Prefer reversible patches if they remain simple and bounded.
- Disable or reconcile editor-native history so it cannot diverge from document state.

### Acceptance Criteria

- Undo from either pane undoes the latest accepted document edit.
- Redo from either pane reapplies the next document edit.
- Source/Source, Visual/Visual, and Source/Visual flows remain synchronized.
- History memory is bounded.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual smoke for typing, formatting, paste, mode switch, recovery restore, and conflict resolution.

### Stop Conditions

- Stop if IME, selection, or editor-native history behavior becomes unreliable.

## Task D4. Investigate ProseMirror Step Synchronization

### Goal and Dependencies

Determine whether Visual-to-Visual synchronization should move from Markdown replacement to ProseMirror steps.

Depends on stable editor adapters from the main 0.3 plan.

### Scope

- Prototype applying compatible ProseMirror/Tiptap steps between two Visual views.
- Compare cursor, selection, scroll, and history behavior against Markdown replacement.
- Document when step sync is safe and when fallback replacement is still needed.

### Non-goals

- Do not rewrite Source/Visual synchronization.
- Do not make Visual sync depend on unsupported Markdown features.
- Do not ship step sync without regression tests.

### Current Expected State After 0.3

- Visual views synchronize through canonical Markdown updates.
- Replacement is safe but may be less precise for selection and history.

### Touched Areas

- Visual editor adapter
- document sync service
- editor integration tests

### Approach

- Keep canonical saved content as Markdown.
- Use steps only as an optimization for compatible Visual views with the same schema.
- Fallback to canonical Markdown replacement whenever step application is unsafe.

### Acceptance Criteria

- Step sync improves Visual/Visual selection and history preservation in tested cases.
- Fallback behavior remains correct.
- No unsupported Markdown is silently rewritten.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual Visual/Visual editing smoke.

### Stop Conditions

- Stop if Tiptap abstractions make step transfer brittle or schema-dependent in a way that increases data-loss risk.

## Task D5. Add Autosave To Original Files

### Goal and Dependencies

Add optional autosave to disk after safe saving, fingerprints, recovery, and watcher conflicts are reliable.

Depends on main 0.3 Tasks 4, 8, and 9.

### Scope

- Add autosave setting and debounce.
- Save only cleanly authorized documents with valid fingerprints.
- Do not autosave scratch documents to arbitrary folders.
- Pause autosave during conflicts, unsafe Markdown acknowledgment gaps, save errors, and missing-target states.
- Surface autosave failures without blocking manual save.

### Non-goals

- Do not remove recovery snapshots.
- Do not autosave files after lossy Visual conversion without acknowledgment.
- Do not add complex per-workspace autosave policy unless required.

### Current Expected State After 0.3

- Recovery snapshots protect dirty content.
- Manual save is atomic and queued.
- External conflicts are detected.

### Touched Areas

- settings state
- save queue
- recovery service
- watcher conflict state
- UI status/notifications
- tests

### Approach

- Default autosave off unless explicitly decided otherwise.
- Reuse the existing save queue with reason `autosave`.
- Collapse pending autosave jobs to the newest revision.

### Acceptance Criteria

- Autosave never overwrites an externally changed dirty file without explicit resolution.
- Manual save still works after autosave failure.
- Autosave status is visible.
- Scratch documents remain protected by recovery snapshots, not silent disk writes.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual Windows smoke for autosave, external changes, conflicts, and recovery.

### Stop Conditions

- Stop if watcher self-event correlation is not reliable enough to distinguish autosave from external changes.

## Task D6. Build Full Conflict Diff And Merge UI

### Goal and Dependencies

Improve conflict resolution beyond the minimal 0.3 actions.

Depends on stable watcher, fingerprints, recovery, and shared document state.

### Scope

- Add a readable comparison view for Folden content versus disk content.
- Allow choosing disk version, Folden version, Save As, or a manually merged result.
- Preserve recovery snapshots until conflict resolution is complete.
- Add tests for conflict state transitions.

### Non-goals

- Do not implement a full semantic Markdown merge engine in the first pass.
- Do not overwrite either version automatically.

### Current Expected State After 0.3

- Conflicts are detected.
- Minimal actions prevent silent overwrite.

### Touched Areas

- conflict dialog/components
- document state
- save/recovery services
- tests

### Approach

- Start with line-based readable diff.
- Keep merge result as an explicit new document revision.
- Make destructive choices confirmable and undoable where document history supports it.

### Acceptance Criteria

- Users can inspect both versions before deciding.
- Choosing a resolution updates document state and fingerprints correctly.
- No conflict action deletes the only copy of dirty content.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual conflict smoke with clean, dirty, deleted, and renamed files.

### Stop Conditions

- Stop if the UI implies semantic merge guarantees that the implementation cannot provide.

## Task D7. Expand E2E And Desktop Automation

### Goal and Dependencies

Move critical user flows from manual smoke tests into automated regression coverage.

Depends on stable 0.3 reliability behavior.

### Scope

- Add Playwright flows with a mocked filesystem service.
- Cover workspace open, lazy expand, file open, edit/save, split view, mixed Visual/Source, dirty close, recovery dialog, conflict dialog, and keyboard navigation.
- Investigate native Tauri smoke automation separately.

### Non-goals

- Do not block development on full native automation if it remains brittle.
- Do not require real user directories or private files in tests.

### Current Expected State After 0.3

- Core domain behavior has unit and Rust tests.
- Desktop scenarios are still mostly manual.

### Touched Areas

- Playwright config/tests
- filesystem service mocks
- CI workflow

### Approach

- Test browser-level UI against mocked services first.
- Keep native desktop smoke as a smaller follow-up after browser flows are stable.
- Add CI only after tests are deterministic locally.

### Acceptance Criteria

- Critical UI flows run in CI without native filesystem access.
- Manual smoke checklist is shorter because covered flows are automated.
- Failures provide actionable screenshots/traces.

### Checks

- `npm run test:e2e`
- CI Playwright job
- Manual verification of one native desktop smoke after changes.

### Stop Conditions

- Stop if mocked services diverge from real Tauri behavior; add contract tests before adding more E2E flows.

## Task D8. Complete Performance Benchmark Matrix

### Goal and Dependencies

Turn basic 0.3 measurements into repeatable performance checks.

Depends on lazy workspace loading and stable editor loading.

### Scope

- Measure cold startup time.
- Measure frontend bundle sizes.
- Measure opening 100 KB and 1 MB Markdown files.
- Measure Source typing latency in a large document.
- Measure Source-to-Visual switch time for supported Markdown.
- Measure workspace open without recursive scan.
- Measure memory with one document in one pane and two panes.

### Non-goals

- Do not optimize without a measured bottleneck.
- Do not add strict universal thresholds before enough baseline history exists.

### Current Expected State After 0.3

- Basic measurements exist.
- Lazy loading prevents obvious regressions.

### Touched Areas

- measurement scripts/docs
- optional benchmark fixtures
- CI or local check scripts

### Approach

- Store fixtures that do not contain private content.
- Keep benchmark commands easy to run on Windows.
- Record baseline and compare future changes against it.

### Acceptance Criteria

- Every original spec measurement has a repeatable procedure.
- Results are recorded in the repository.
- Regressions are visible before release.

### Checks

- benchmark command or documented manual run
- `npm run build`
- `npm run app:build`

### Stop Conditions

- Stop if automation is too noisy on developer machines; keep documented manual measurements until CI hardware is stable.

## Task D9. Add Settings And Workspace Ignore Policy

### Goal and Dependencies

Create a settings foundation for reliability and workspace behavior.

Depends on Task D1 and lazy workspace loading.

### Scope

- Add settings store/service.
- Add user-facing settings for autosave if Task D5 ships.
- Add workspace-specific ignore rules.
- Add future-ready settings for remote image loading.
- Persist settings separately from document content and recovery snapshots.

### Non-goals

- Do not build a full preferences window if a compact settings surface is enough.
- Do not implement plugin-defined settings.
- Do not index ignored files.

### Current Expected State After 0.3

- Some settings-like decisions are hardcoded.
- Built-in ignored directories exist.

### Touched Areas

- settings state
- workspace loading
- remote image policy
- docs/tests

### Approach

- Keep global settings and workspace settings distinct.
- Make defaults conservative.
- Validate ignore patterns before applying them.

### Acceptance Criteria

- Workspace ignore rules affect lazy tree loading.
- Settings persist and survive malformed settings files.
- Settings never store document content.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual settings/workspace smoke.

### Stop Conditions

- Stop if ignore pattern semantics need product-level rules that are not yet decided.

## Task D10. Complete Remote Image UX

### Goal and Dependencies

Move from minimal remote-image blocking to a usable, explicit loading experience.

Depends on Markdown/link/image safety from the main 0.3 plan and settings foundation if global setting is included.

### Scope

- Render placeholders for remote images.
- Add Load Remote Images for this document.
- Add optional global setting only after the per-document flow is safe.
- Keep local workspace images on a controlled asset path.
- Handle image failures without breaking editing.

### Non-goals

- Do not add arbitrary network fetch features.
- Do not bypass CSP to make remote images work.
- Do not load remote images before explicit user action.

### Current Expected State After 0.3

- Remote images do not silently make network requests.
- Remote image insertion may be blocked or minimally controlled.

### Touched Areas

- Visual editor image extension/config
- Markdown render policy
- settings
- CSP
- tests

### Approach

- Treat remote image loading permission as document/session scoped by default.
- Keep source Markdown unchanged.
- Use placeholders in Visual mode only.

### Acceptance Criteria

- Opening a document with remote images makes no automatic remote request.
- User can explicitly load remote images for the current document.
- Failed loads are visible and non-destructive.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual Visual smoke with local, data, and remote images.

### Stop Conditions

- Stop if Tiptap image rendering cannot be controlled without custom extension work larger than planned.

## Task D11. Add Bug Report Package Flow

### Goal and Dependencies

Let users collect diagnostics explicitly without telemetry.

Depends on local logging and recovery privacy rules.

### Scope

- Add action to collect logs and app diagnostic metadata into a local archive.
- Require explicit confirmation.
- Exclude recovery snapshots and document content.
- Redact full user paths by default.

### Non-goals

- Do not upload reports automatically.
- Do not include private files.
- Do not include document text.

### Current Expected State After 0.3

- Local bounded logs exist.
- User can open logs folder.

### Touched Areas

- diagnostics service
- Rust helper commands
- UI action/dialog
- tests

### Approach

- Generate an archive in a user-selected or app data location.
- Show exactly what categories are included before creation.
- Keep collection local.

### Acceptance Criteria

- Report archive can be generated by explicit user action.
- Archive contains logs and metadata only.
- Document content and recovery snapshots are excluded.

### Checks

- `npm run typecheck`
- `npm run test`
- Manual report-generation smoke.

### Stop Conditions

- Stop if redaction cannot be guaranteed for existing log lines.

## Task D12. Build Full Release Automation

### Goal and Dependencies

Finish release/version tooling beyond the minimum 0.3 hardening.

Depends on stable CI and version consistency checks.

### Scope

- Add one release command for version bump, changelog gate, package metadata, lockfile update, and release validation.
- Verify package, Tauri, Cargo, and lockfile versions.
- Optionally prepare unsigned artifacts without publishing.

### Non-goals

- Do not add signing or publishing without explicit release infrastructure decisions.
- Do not auto-generate changelog content from commits unless the format is agreed.

### Current Expected State After 0.3

- Version consistency script exists.
- CI validates release-like builds.

### Touched Areas

- scripts
- package metadata
- Tauri/Cargo metadata
- docs
- CI

### Approach

- Keep the command deterministic and Windows-friendly.
- Fail loudly on inconsistent versions or missing changelog entry.
- Keep release notes human-authored.

### Acceptance Criteria

- One command validates all release metadata.
- Version mismatch fails before build artifacts are produced.
- Release checklist is documented.

### Checks

- release validation command
- `npm run build`
- `npm run app:build`
- Rust fmt/clippy/tests

### Stop Conditions

- Stop if artifact signing, installer publishing, or secret management becomes required.

## Task D13. Improve Markdown Round-Trip Semantics

### Goal and Dependencies

Move beyond fixture equality toward stronger confidence that Visual mode preserves supported Markdown.

Depends on the main 0.3 Markdown safety gate.

### Scope

- Add semantic comparison for supported Markdown constructs.
- Distinguish harmless whitespace normalization from content loss.
- Expand fixtures for nested lists, blockquotes, code fences, links, images, Unicode, LF, CRLF, and frontmatter detection.

### Non-goals

- Do not support tables, task lists, or raw HTML editing unless product scope changes.
- Do not build a full Markdown formatter.

### Current Expected State After 0.3

- Supported and unsafe fixtures exist.
- Unsafe Markdown is blocked or warned before lossy Visual conversion.

### Touched Areas

- Markdown safety tests
- test fixtures
- optional parser utilities

### Approach

- Prefer existing Markdown parser utilities already in the stack.
- Compare parsed structure for supported constructs.
- Keep raw source assertions for line ending and BOM preservation where semantic comparison is insufficient.

### Acceptance Criteria

- Supported Markdown round-trips without content or structure loss.
- Unsafe Markdown fixtures fail the safety gate.
- Tests explain accepted whitespace normalization.

### Checks

- `npm run test`
- Manual Source/Visual smoke for representative fixtures.

### Stop Conditions

- Stop if semantic comparison requires adopting a large new parser stack without a clear benefit.

## Recommended Order

1. D1 Complete Frontend Layer Separation.
2. D2 Finish Command Registry And Shortcut Model.
3. D3 Ship Full Document-Level Undo/Redo if still deferred.
4. D4 Investigate ProseMirror Step Synchronization.
5. D5 Add Autosave To Original Files.
6. D6 Build Full Conflict Diff And Merge UI.
7. D7 Expand E2E And Desktop Automation.
8. D8 Complete Performance Benchmark Matrix.
9. D9 Add Settings And Workspace Ignore Policy.
10. D10 Complete Remote Image UX.
11. D11 Add Bug Report Package Flow.
12. D12 Build Full Release Automation.
13. D13 Improve Markdown Round-Trip Semantics.

This order keeps refactors before broad UX additions, finishes shared editing semantics before autosave, and adds deeper automation after the reliability behavior is stable.
