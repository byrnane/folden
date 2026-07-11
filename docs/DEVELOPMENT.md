# Folden Development

This document covers setup, commands, checks, CI, build artifacts, and release workflow. See [ARCHITECTURE.md](ARCHITECTURE.md) for code ownership and dependency rules, and [RELEASE.md](RELEASE.md) for the release checklist.

## Requirements

Folden uses:

- Node.js and npm;
- Rust toolchain with Cargo;
- Windows C++ Build Tools with the `Desktop development with C++` workload;
- Microsoft Edge WebView2 runtime.

On Windows, install Rust with Rustup:

```powershell
winget install --id Rustlang.Rustup
```

Open a new terminal and verify:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

If `cargo` is installed but not visible in the current shell, Folden's Tauri wrapper adds the standard Rustup Cargo path before running desktop commands.

## Setup

Install npm dependencies:

```powershell
npm install
```

For CI-like installs, use:

```powershell
npm ci
```

## Frontend Commands

Run the browser-only Vite app:

```powershell
npm run vue:dev
```

Build the frontend:

```powershell
npm run vue:build
```

Preview a built frontend:

```powershell
npm run vue:preview
```

The browser-only frontend does not provide real native dialogs, filesystem access, window close events, or workspace watcher behavior.

## Desktop Commands

Run the Tauri app in development:

```powershell
npm run app:dev
```

Build the Tauri app without installers:

```powershell
npm run app:build
```

Build installer bundles for release verification:

```powershell
npm run tauri -- build
```

Run the last built desktop executable:

```powershell
npm run app:run
```

Forward a command to the Tauri CLI:

```powershell
npm run tauri -- <command>
```

## Quality Commands

Run the main quality gate:

```powershell
npm run quality
```

`quality` runs:

- `npm run version:check`;
- `npm run format:check`;
- `npm run vue:typecheck`;
- `npm run vue:unused`;
- `npm run deps:cycles`;
- `npm run lint`;
- `npm run test:unit`.

Run individual frontend checks:

```powershell
npm run vue:typecheck
npm run vue:unused
npm run deps:cycles
npm run lint
npm run test:unit
npm run test:coverage
npm run test:e2e
```

Run headed or UI E2E modes when debugging browser smoke tests:

```powershell
npm run test:e2e:headed
npm run test:e2e:ui
```

Run Rust checks from `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Working Process

1. Read the relevant project instructions and nearby files.
2. Make the smallest change that solves the task.
3. Keep user-facing behavior, file ownership, and native contracts explicit.
4. Run the narrowest meaningful checks for the changed area.
5. For release or risky UI/runtime work, run the broader quality gate and a desktop smoke test.

Before committing a normal code change, prefer:

```powershell
npm run quality
npm run lint
npm run test:coverage
npm run vue:build
```

For native or release-sensitive changes, also run:

```powershell
npm run test:e2e
cd src-tauri
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Build Artifacts

Frontend build output goes to:

```text
dist/
```

Desktop build output goes to:

```text
build/desktop/
```

The current Windows executable path is:

```text
build/desktop/release/app.exe
```

`scripts/tauri.mjs` sets `CARGO_TARGET_DIR=build/desktop` so Rust build artifacts stay out of `src-tauri/target`. `vite.config.ts` ignores both `src-tauri/target` and `build/desktop` to avoid Windows watcher conflicts with locked Cargo files.

The Source and Visual editors are loaded as separate chunks. The 0.8.5 closeout baseline is about 240 KB for the startup chunk, 530 KB for Visual, and 609 KB for Source before gzip. Vite's 500 KB warning remains expected for the editor chunks because CodeMirror and Tiptap load only when their editor is opened; do not hide it by raising the global warning limit.

## Windows CI

`.github/workflows/windows.yml` runs on pushes to `master` and `main`, and on pull requests. It currently performs:

- checkout;
- Node setup with npm cache;
- Rust setup with `rustfmt` and `clippy`;
- Rust cache;
- `npm ci`;
- `npm run quality`;
- `cargo fmt --check`;
- `cargo clippy -- -D warnings`;
- `cargo test`.

Browser E2E and desktop builds stay in the release gate and are not run on every push.

## Version and Release Workflow

Check that tracked version files agree:

```powershell
npm run version:check
```

Prepare the next patch release:

```powershell
npm run version:bump -- patch
```

`version:bump` updates the tracked application version files and prepares the top changelog entry. Use it only for an intentional release commit. Documentation-only commits should not bump the version or add a user-facing changelog release entry.

Before a release commit, run the full quality gate expected for the release scope and manually smoke-test the desktop app from the built executable when user-facing behavior changed. Before publishing a release, use [RELEASE.md](RELEASE.md) and verify the installer bundle, not only `npm run app:build`.
