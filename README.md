# Folden

Folden is a lightweight local-first Markdown editor.

The project goal is to combine a fast desktop writing tool, Markdown-friendly files, and a visual editing experience without hiding user documents in an opaque database.

## Current Status

The repository currently contains the 0.3 desktop editor:

* Vue 3 + TypeScript + Vite;
* Tauri 2 shell;
* visual Markdown editing with Tiptap 3;
* CodeMirror source mode;
* native text file open/save;
* workspace folder opening and file tree;
* workspace file and folder create/rename/trash actions;
* multiple open files with tabs;
* two-pane split view;
* explicit dirty-state handling with shared undo/redo;
* atomic saves with stale-write protection;
* crash recovery for saved and scratch documents;
* filesystem watcher with conflict and missing-target states;
* lazy workspace tree loading by directory;
* Markdown safety checks before Visual mode;
* production CSP, link validation, and remote-image blocking in Visual mode;
* bounded local logs and logs-folder access;
* centered editor canvas with a polished dark theme.

Still out of scope: autosave, backlinks, SQLite indexing, custom blocks, slash commands, plugin API, and arbitrary split grids.

## Run Frontend

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

This runs only the Vue/Vite frontend in the browser. Native file dialogs and workspace commands require the desktop app.

Build the frontend:

```powershell
npm run build
```

## Run Desktop

Start the Tauri development app:

```powershell
npm run app:dev
```

The npm Tauri wrapper automatically adds the standard Rustup Cargo path to `PATH` on Windows.

Build the Tauri app without installers:

```powershell
npm run app:build
```

Run the last built desktop app:

```powershell
npm run app:run
```

The desktop executable is built into `build/desktop/release/`.

Low-level Tauri CLI access is still available when needed:

```powershell
npm run tauri -- <command>
```

## Desktop Setup

Tauri development requires Rust and Windows native build tools.

Install Rust:

```powershell
winget install --id Rustlang.Rustup
```

Then open a new terminal and verify:

```powershell
rustc --version
cargo --version
```

See [docs/SETUP.md](docs/SETUP.md) for the Windows setup notes.

## Project Notes

* [VISION.md](VISION.md) describes the product direction.
* [TECH_STACK.md](TECH_STACK.md) describes the intended stack.
* [ROADMAP.md](ROADMAP.md) lists the long-term milestones.
* [CHANGELOG.md](CHANGELOG.md) tracks version changes.
* [specs/FOLDEN_V0.3_MEASUREMENTS.md](specs/FOLDEN_V0.3_MEASUREMENTS.md) records the 0.3 performance baseline and repeatable measurement procedure.
* [docs/MVP.md](docs/MVP.md) defines the proposed first useful version.
* [docs/EDITOR_ENGINE.md](docs/EDITOR_ENGINE.md) describes the editor engine split.
* [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) lists the immediate handoff steps.
