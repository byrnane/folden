# Folden

Folden is a lightweight local-first text editor.

The project goal is to combine a fast desktop writing tool, Markdown-friendly files, and a future visual block editor without hiding user documents in an opaque database.

## Current Status

The repository currently contains the first desktop scaffold:

* Vue 3 + TypeScript + Vite;
* Tauri 2 shell;
* npm package setup;
* CodeMirror source editor;
* minimal single-document editor screen;
* minimal dark theme;
* native open/save commands for text files;
* dirty state;
* character count;
* basic build verification.

The current app is still an early 0.1 build. It has one editing surface and no workspace, tabs, autosave, recovery, or visual block editor yet.

## Run Frontend

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

This runs only the Vue/Vite frontend in the browser.

Build the frontend:

```powershell
npm run build
```

Preview the built frontend:

```powershell
npm run preview
```

This serves the already-built `dist/` directory. It is not the desktop app.

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
* [docs/MVP.md](docs/MVP.md) defines the proposed first useful version.
* [docs/EDITOR_ENGINE.md](docs/EDITOR_ENGINE.md) compares the editor engine options.
* [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) lists the immediate handoff steps.
