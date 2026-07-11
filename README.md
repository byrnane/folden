# Folden

English | [Русский](README.ru.md)

Folden is a local-first desktop editor for Markdown and plain text files.

It is built around a simple contract:

- user content stays on the user's machine;
- ordinary files remain the source of truth;
- Markdown stays readable outside Folden;
- core workflows should stay direct and predictable.

## What It Does

Folden can open files and folders, edit Markdown in Source or Visual mode, navigate long documents through an outline and document map, work with tabs and a two-pane split view, save safely, recover unsaved work, detect external changes, and keep local layout/settings between launches.

It is not a cloud notes service, collaboration platform, mobile app, database-backed knowledge base, plugin platform, or AI writing product.

## Requirements

- Node.js and npm.
- Rust toolchain with Cargo.
- Windows C++ Build Tools with the `Desktop development with C++` workload.
- Microsoft Edge WebView2 runtime.

## Quick Start

```powershell
npm install
npm run app:dev
```

Useful commands:

```powershell
npm run vue:dev       # browser-only frontend
npm run app:build     # desktop build without installers
npm run app:run       # run the last built desktop executable
npm run quality       # version, type, unused, cycles, lint, and unit checks
npm run test:e2e      # Playwright smoke tests
```

Rust checks run from `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md) — product principles, supported surface, and boundaries.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, scripts, checks, CI, builds, and releases.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code ownership, dependency flow, and testing map.
- [docs/RELEASE.md](docs/RELEASE.md) — release checklist.
- [docs/DOGFOODING.md](docs/DOGFOODING.md) — dogfooding template.
- [CHANGELOG.md](CHANGELOG.md) — release history.
