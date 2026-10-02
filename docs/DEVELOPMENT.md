# Development

[Русский](DEVELOPMENT.ru.md) · [Architecture](ARCHITECTURE.md) · [Release procedure](RELEASE.md)

These are maintainer instructions, with a limited Linux self-build path below. Public availability does not grant permission to modify or redistribute author source; see [LICENSE.md](../LICENSE.md).

Use **Node 24.16.0** (.nvmrc) and **Rust 1.96.0** (rust-toolchain.toml). Follow [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/): Windows C++ Build Tools and WebView2, Xcode Command Line Tools on macOS, or WebKitGTK 4.1 and development libraries on Ubuntu 22.04. macOS release packages target version 14 or newer.

```text
npm ci
npm run app:dev
```

Development uses com.folden.editor.dev with separate settings, sessions and recovery. app:run uses the release profile; do not replace a live installation or clear profiles during a smoke test without permission and a verified backup.

## Linux self-build

Official beta packages are provided for Windows and macOS. Linux is available only as a private local build of the unmodified source for your own personal or commercial use under [LICENSE.md](../LICENSE.md), without official installation or native acceptance guarantees. Install the pinned Node/Rust versions and [Tauri's Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux); Ubuntu 22.04 with WebKitGTK 4.1 is the build baseline. From the repository root:

```text
npm ci
npm run app:build
npm run licenses:check
npm run app:run
```

This builds a local executable without an installer. Keep the generated third-party notices and the licenses/source rights of dependencies. Do not modify or redistribute this build, or represent it as an official release. Linux package generation and AppImage payload attribution are outside this beta.

## Maintainer checks

| Command                  | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| npm run vue:dev          | Browser UI without native filesystem/dialogs                             |
| npm run vue:build        | Frontend build                                                           |
| npm run app:dev          | Native development application                                           |
| npm run app:build        | Executable without installer                                             |
| npm run app:run          | Last local release executable                                            |
| npm run quality          | Version, format, types, unused code, dependency cycles, lint, unit tests |
| npm run test:coverage    | Unit coverage                                                            |
| npm run test:e2e         | Chromium functional/UI tests; visual baselines are Windows               |
| npm run test:performance | Separate measured performance gate                                       |
| npm run test:release     | Release-script regressions                                               |
| npm run privacy:check    | Current source privacy patterns and historical identities                |
| npm run licenses:check   | Deterministic legal inventory against installed locked dependencies      |

Native checks from src-tauri are cargo fmt --check, cargo clippy --locked --all-targets -- -D warnings, and cargo test --locked. CI tests native code on the three official release targets; browser E2E runs on Windows. Native OS acceptance remains separate.

Frontend output is dist/. Cargo output is build/desktop/ with incremental compilation disabled. Explicit release targets write build/desktop/<target>/release/. Staged distribution files go to build/release/<target>/ after final package verification. Keep historical checkout builds in separate target directories to prevent stale bundler inputs.

Dev and frontend builds generate THIRD_PARTY_NOTICES.md automatically. It and downloaded upstream license inputs are ignored by Git; full notices are included in the application, installers and release artifacts. The generator fetches locked Cargo sources, reads platform dependency graphs and verifies pinned upstream license downloads by SHA-256. Linux dependency notices remain available for self-builds. The first run requires network access; subsequent runs reuse verified license inputs in .cache/. After a dependency change, run npm ci, npm run licenses:generate, inspect notices/provenance, and run npm run licenses:check.

Local caches, diagnostics, personal documents and .codex configuration belong outside the public export. Privacy checks print filenames/reasons, never matched private values. Synthetic paths have exact file/literal allowlists; do not broadly exclude tests. Original Git remains untouched while a separate sanitized history is prepared.

The editor source/visual chunks are loaded on demand; Vite's editor-size warning is expected. Preserve document bytes, unsupported Markdown, localization and content ownership when changing the editor. [Dogfooding](DOGFOODING.md) records real work sessions; automated tests are separate evidence.
