# Development

[Русский](DEVELOPMENT.ru.md) · [Architecture](ARCHITECTURE.md) · [Release procedure](RELEASE.md)

This guide covers development by the project owner and the permitted Linux self-build. The [license](../LICENSE.md) defines the rights to use the source and distribute builds.

## Setup

Install **Node 24.16.0** and **Rust 1.96.0**, as specified in `.nvmrc` and `rust-toolchain.toml`. Follow [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS: C++ Build Tools and WebView2 on Windows, Xcode Command Line Tools on macOS, or WebKitGTK 4.1 and development libraries on Linux.

From the repository root:

```text
npm ci
npm run app:dev
```

Development uses the `com.folden.editor.dev` application identifier and separate settings, sessions, and recovery data. `npm run app:run` launches the last local release build with the `com.folden.editor` profile. Before replacing an installed application or clearing a profile, obtain the owner's permission and verify a backup.

## Linux self-build

The license permits a private local build of the unmodified source for your own personal or commercial use. Modification and redistribution remain prohibited. See [LICENSE.md](../LICENSE.md) for the full terms.

Use the pinned Node and Rust versions and install [Tauri's Linux dependencies](https://v2.tauri.app/start/prerequisites/#linux). The build baseline is Ubuntu 22.04 with WebKitGTK 4.1. From the repository root:

```text
npm ci
npm run app:build
npm run licenses:check
npm run app:run
```

This creates a local executable without an installer. Keep the generated third-party notices and respect the dependencies' licenses. Official beta packages are available for Windows and macOS. Linux has no official package or recorded native acceptance in this beta.

## Maintainer checks

| Command                    | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm run vue:dev`          | Browser interface; native file access and dialogs require the desktop app         |
| `npm run vue:build`        | Type check and frontend build                                                     |
| `npm run app:dev`          | Desktop development app                                                           |
| `npm run app:build`        | Local executable without an installer                                             |
| `npm run app:run`          | Last local release executable                                                     |
| `npm run quality`          | Versions, formatting, types, unused code, dependency cycles, lint, and unit tests |
| `npm run test:coverage`    | Unit tests with coverage thresholds                                               |
| `npm run test:e2e`         | Chromium tests; screenshot baselines are recorded on Windows                      |
| `npm run test:e2e:smoke`   | Ten core Chromium scenarios used by automatic CI                                  |
| `npm run test:performance` | Separate frontend, browser, and native performance checks                         |
| `npm run test:release`     | Release-script checks                                                             |
| `npm run privacy:check`    | Check tracked and unignored source files for private data                         |
| `npm run licenses:check`   | Generated notices against locked dependencies                                     |

Install the test browser with `npx playwright install chromium` before the first E2E run. For Rust checks, run from `src-tauri`:

```text
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Pushes and pull requests run code quality checks, all unit tests, release-script and privacy checks, license verification, a frontend build, and ten core Chromium scenarios on Windows. The smoke tests cover opening and saving files, autosave, Visual/Source switching, undo/redo, split panes, recovery, and conflicts.

For the full suite, use **Actions → CI → Run workflow**. This also runs coverage, all browser tests, performance checks, and Rust checks on Windows x64 and both macOS architectures. Native jobs keep their required check names and are marked as skipped on automatic runs. Release candidates retain the full suite in **Draft beta release**.

Record checks in the installed desktop app separately; see the [beta verification record](BETA-0.12.0.md).

## Build output and licenses

The frontend builds into `dist/`. Cargo uses `build/desktop/` with incremental compilation disabled. Explicit targets write to `build/desktop/<target>/release/`. Package verification prepares files in `build/release/<target>/`. Use a separate Cargo target directory when building an older checkout to avoid mixing its output with current packages.

Vite generates `THIRD_PARTY_NOTICES.md` during development and frontend builds. The file and downloaded license inputs are ignored by Git; official packages include the full notices. The generator reads the locked npm and Cargo dependency graphs for Windows, Linux, and macOS. It downloads missing Cargo sources and verifies pinned license downloads by SHA-256. The first run needs network access; later runs reuse verified inputs from `.cache/`.

After changing dependencies:

```text
npm ci
npm run licenses:generate
npm run licenses:check
```

Review the generated notices, component versions, and source links before packaging. See the [release procedure](RELEASE.md) for package checks and required third-party source archives.

Keep personal documents, diagnostics, caches, and local `.codex` settings out of commits. Privacy checks print filenames and reasons without revealing matched values. Allow synthetic paths only through exact fixture entries; keep the rest of the tests covered by the check.

## Working on the editor

Source and Visual editor code loads on demand. Vite's warning about their chunk size is expected. Preserve unchanged Markdown, unsupported syntax, file formats, localization, and the user's document content. The [architecture guide](ARCHITECTURE.md) describes state ownership and save/recovery flows. Use the [daily-use log](DOGFOODING.md) to record real work sessions.
