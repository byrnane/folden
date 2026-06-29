# Folden 0.4 Implementation Plan

**Release:** `0.4.0`  
**Working title:** Architecture + User-Visible Maturity  
**Baseline checked against:** Folden `0.3.2`

## Current Baseline

- Folden 0.3 reliability core is already present: revision-based document state, shared undo/redo, atomic saves, recovery snapshots, watcher events, CSP, diagnostics, unit tests, Rust tests, browser E2E, and Windows CI.
- `specs/FOLDEN_V0.3_TECH_DEBT_PLAN.md` is now historical context. Some items are complete, some are partially complete, and the remaining work should be narrowed for 0.4 instead of executed as written.
- `src/App.vue` is still the main orchestration hub and remains the primary architecture risk.

## 0.4 Goals

1. Reduce `App.vue` into a composition root and layout shell.
2. Add stable command, settings, autosave, conflict, and remote-resource contracts.
3. Make 0.4 visible to users through autosave, better conflict handling, settings, remote image loading UX, and broader automated flows.
4. Keep the native filesystem authority in Rust and preserve the 0.3 data-safety guarantees.

## Task 1. Plan Artifact And Superseded Debt Audit

- Keep this file as the implementation source for 0.4.
- Treat `FOLDEN_V0.3_TECH_DEBT_PLAN.md` as a historical backlog, not the active plan.
- Acceptance: future tasks reference this plan and do not reintroduce completed 0.3 debt as new work.

## Task 2. Extract Application Shell From `App.vue`

- Move document orchestration, workspace tree state, dialogs, session/recovery, watcher handling, and save flow into small composables/services.
- Keep UI behavior unchanged during extraction.
- Acceptance: `App.vue` owns layout wiring only; business rules live in named modules with tests where practical.
- Checks: `npm run vue:typecheck`, `npm run test:unit`, `npm run test:e2e`.

## Task 3. Introduce Stores Only Where They Clarify Ownership

- Prefer Vue-native composables first.
- Add Pinia only for state shared broadly enough that composables become ambiguous.
- Acceptance: document content, view state, workspace state, settings, and notifications each have one clear owner.

## Task 4. Command Registry And Shortcut Contract

- Route buttons, menus, and global shortcuts through one command registry.
- Include only commands backed by existing behavior or 0.4 tasks.
- Acceptance: disabled commands cannot execute through shortcuts; editor-native shortcuts are not stolen accidentally.

## Task 5. Settings Foundation

- Persist global settings separately from session/recovery data.
- Include autosave, remote image policy, and workspace ignore defaults.
- Defaults: autosave off, remote images blocked until explicit user action, conservative built-in ignores retained.
- Acceptance: malformed settings are ignored safely and settings never store document content.

## Task 6. Autosave To Original Files

- Extend save jobs to support `manual` and `autosave` reasons.
- Reuse the existing save queue, fingerprints, watcher conflict state, and Markdown safety checks.
- Do not autosave scratch documents or conflicted/missing documents.
- Acceptance: autosave pauses on conflict, missing target, save error, and unsafe unacknowledged Visual state; manual save remains authoritative.

## Task 7. Conflict Diff And Merge UI

- Replace minimal conflict actions with a readable line-based comparison.
- Actions: keep Folden version, reload disk version, save as, apply manual merged result.
- Acceptance: conflict resolution creates an explicit document revision and never deletes the only dirty copy.

## Task 8. Remote Image UX

- Keep remote images blocked by default.
- Add placeholders and a per-document "Load remote images" action.
- Add an optional global setting only after per-document permission is stable.
- Acceptance: opening Markdown never makes remote requests without explicit user action.

## Task 9. Markdown Round-Trip Confidence

- Upgrade fixture tests with semantic comparison for supported Markdown where practical.
- Keep conservative blocking for unsupported constructs.
- Acceptance: supported Markdown preserves structure/content; unsafe constructs fail the safety gate before Visual rewrite.

## Task 10. E2E And Native Smoke Coverage

- Expand mocked-Tauri Playwright flows for lazy workspace expansion, split view, mixed Source/Visual editing, recovery, conflicts, settings, autosave, and remote images.
- Keep native Tauri automation separate unless it becomes stable.
- Acceptance: browser-level CI covers the core 0.4 user-visible flows.

## Task 11. Performance And Release Maturity

- Create or update a 0.4 measurement file for startup, workspace open, file open, editor switch, typing latency, and memory checks.
- Add bug-report package flow only after log redaction is verified.
- Acceptance: release candidate has recorded measurements and local-only diagnostic export.

## Task 12. Release Hardening

- Bump versions only at the end.
- Update `CHANGELOG.md` in Russian with implemented behavior only.
- Run the full release gate:
  - `npm run version:check`
  - `npm run vue:typecheck`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run vue:build`
  - `cd src-tauri && cargo fmt --check`
  - `cd src-tauri && cargo clippy -- -D warnings`
  - `cd src-tauri && cargo test`
  - `npm run app:build`

## Assumptions

- 0.4 is user-visible, not only internal hardening.
- Autosave defaults to off unless explicitly changed later.
- Pinia is optional and should not be introduced for symmetry alone.
- Full semantic merge, plugin API, backlinks, custom blocks, and export stay out of 0.4.
