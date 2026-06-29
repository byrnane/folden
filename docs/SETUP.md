# Folden Setup

## Current Requirements

Folden uses npm for frontend dependencies.

For frontend-only development:

```powershell
npm install
npm run vue:dev
```

For production frontend build:

```powershell
npm run vue:build
```

---

## Tauri Requirements On Windows

Tauri requires Rust and native Windows build tools.

Install Rust:

```powershell
winget install --id Rustlang.Rustup
```

Use the default MSVC toolchain. If the installer asks for a host triple, choose the MSVC option.

Install or verify Microsoft C++ Build Tools with the `Desktop development with C++` workload.

After installation, open a new terminal and verify:

```powershell
rustc --version
cargo --version
```

If a terminal still cannot find `cargo`, Folden's npm Tauri script adds the standard Rustup path automatically:

```powershell
npm run app:dev
```

Tauri also uses Microsoft Edge WebView2 on Windows. It is usually already available on Windows 11.

## Vite And Tauri Target Directory

Vite must not watch Rust build output. Cargo creates and locks executable files there during Rust builds, and Windows can report `EBUSY` when Vite tries to watch those files.

The project ignores `src-tauri/target` and `build/desktop` in `vite.config.ts`.

## Build Output

Frontend-only builds go to:

```text
dist/
```

Desktop builds go to:

```text
build/desktop/
```

The current Windows executable is:

```text
build/desktop/release/app.exe
```

This path is controlled by `CARGO_TARGET_DIR` in `scripts/tauri.mjs`.
