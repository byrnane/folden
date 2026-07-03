# Folden

Folden is a local-first desktop editor for Markdown and plain text files.

The project is built around three product principles:

* local-first: user content stays on the user's machine;
* file-first: ordinary files remain the source of truth;
* Markdown-friendly: documents stay readable and editable outside Folden.

## Status

The repository describes Folden `0.6.9`: a working Windows desktop editor with native file access, workspaces, tabs, two-pane split view, source and visual Markdown editing, autosave, recovery, external-change handling, local diagnostics, persisted layout settings, and a compact dark writing surface.

Already implemented:

* native open/save for text files, including line ending and UTF-8 BOM preservation;
* workspace opening, lazy directory loading, file tree actions, recent workspaces, and ignored names;
* tabs, tab reorder, tab transfer between panes, Open Editors, two-pane split view, active-pane state, shared document sessions, undo, and redo;
* activity rail, workspace and settings surfaces, resizable sidebar and rail, focus mode, density settings, and persisted layout reset;
* CodeMirror source mode and Tiptap visual Markdown mode with a shared document toolbar;
* safety checks for Visual mode links and images, with remote images blocked until the user allows them;
* atomic saves, stale-write detection, missing-file states, and conflict resolution;
* optional autosave for saved files, with delay, window-blur, and document-switch settings;
* session persistence and crash recovery for saved and scratch documents;
* filesystem watcher integration for workspace and document updates;
* bounded local logs, logs-folder access, diagnostic report export, and toast feedback;
* unit, contract, E2E, frontend build, and Rust checks.

Not part of the current implementation: cloud sync, accounts, collaboration, mobile apps, backlinks, SQLite indexing, custom blocks, slash commands, plugin API, export pipelines, and arbitrary split grids.

## Stack

* Vue 3, TypeScript, and Vite for the frontend.
* Tauri 2 and Rust for native desktop integration.
* CodeMirror 6 for source/plain-text editing.
* Tiptap 3 for visual Markdown editing.
* Vitest, Playwright, ESLint, rustfmt, clippy, and Cargo tests for verification.

## Requirements

* Node.js and npm.
* Rust toolchain with Cargo.
* Windows C++ Build Tools with the `Desktop development with C++` workload.
* Microsoft Edge WebView2 runtime.

## Commands

Install dependencies:

```powershell
npm install
```

Run the browser-only frontend:

```powershell
npm run vue:dev
```

Run the desktop app in development:

```powershell
npm run app:dev
```

Build the frontend:

```powershell
npm run vue:build
```

Build the desktop app without installers:

```powershell
npm run app:build
```

Run the last built desktop executable:

```powershell
npm run app:run
```

Run the main quality gate:

```powershell
npm run quality
```

Run additional checks:

```powershell
npm run lint
npm run test:coverage
npm run test:e2e
```

Check or prepare version files when doing a release:

```powershell
npm run version:check
npm run version:bump -- patch
```

Rust checks run from `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Documentation

* [docs/PRODUCT.md](docs/PRODUCT.md) describes the product principles and boundaries.
* [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) describes setup, scripts, checks, CI, and release workflow.
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the current code architecture.
* [docs/RELEASE.md](docs/RELEASE.md) contains the release checklist.
* [docs/DOGFOODING.md](docs/DOGFOODING.md) tracks dogfooding scenarios and real issues.
* [CHANGELOG.md](CHANGELOG.md) tracks released changes.

## Repository Structure

* `src/ui` contains Vue views, editors, dialogs, and workspace UI.
* `src/application` contains the application facade, controllers, workflows, commands, ports, and shell types.
* `src/domain` contains framework-independent document, workspace, Markdown, native contract, and save/recovery rules.
* `src/infrastructure` contains browser/Tauri adapters and settings persistence.
* `src-tauri/src` contains the Rust native layer and Tauri command registration.
* `tests/unit` contains domain, application controller, infrastructure, and UI unit tests.
* `tests/contracts` contains native contract fixtures.
* `tests/e2e` contains Playwright smoke specs split by panes/tabs, recovery/conflict, settings/autosave, shell/layout, visual safety, and workspace save flows.
* `.github/workflows/windows.yml` contains the Windows CI quality gate.
