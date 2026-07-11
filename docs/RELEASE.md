# Folden Release Checklist

Use this checklist before tagging or publishing a Folden release. Keep evidence in the release notes, PR, or local release log.

## Version Sync

- Run `npm run version:check`.
- Confirm the same version in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and the top `CHANGELOG.md` entry.
- Confirm docs do not describe removed or renamed modules.

## Automated Checks

Run from the repository root unless a command says otherwise:

```powershell
npm run quality
npm run test:coverage
npm run test:e2e
npm run vue:build
```

Run from `src-tauri/`:

```powershell
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

## Markdown Closeout Checks

For editor releases, confirm the automated E2E coverage includes:

- Visual/Source switching without dirty state when content is unchanged.
- Visual edits immediately followed by Source mode.
- Large kitchen-sink Markdown through Visual, Source, save, close, and reopen.
- Source preservation for raw HTML, HTML comments, and frontmatter.
- Visual safety gates for Markdown constructs that Tiptap cannot preserve as raw source.
- Table cell edits, row/column commands, table deletion, and task-list checkbox persistence.
- Source link/image dialogs for insert, edit, cancel, and validation.
- Scratch `Untitled.md` toolbar behavior before save.
- Tab, workspace-file, and external-path drag/drop into editor panes and right split.
- Workspace-level ignores survive reopening the workspace and do not close already opened files.
- Outline follows the active Markdown section in Source and Visual; keyboard navigation and document-map click/drag remain usable.

Do not describe Visual mode as supporting every Markdown construct. The 0.7 contract is supported CommonMark/GFM editing plus safety-gated raw blocks; Source remains the preservation path for raw Markdown.

## Desktop Build

Build the installer bundle, not only the `--no-bundle` executable:

```powershell
npm run tauri -- build
```

For a non-installer smoke build, `npm run app:build` remains available and maps to `tauri build --no-bundle`.

For Windows, verify which bundle targets were produced from `src-tauri/tauri.conf.json`. The current config has `bundle.active: true` and `bundle.targets: "all"`.

## Manual Windows Installer Smoke

Use the built Windows installer artifact:

- Install on a clean Windows environment.
- Launch Folden for the first time after install.
- Confirm launch works without Node.js, Rust, or dev dependencies installed.
- Confirm WebView2 is present and the UI renders.
- Confirm shortcuts and Start Menu entries are created as expected.
- Open a real Markdown project.
- Open, edit, save, close, and reopen a Markdown file.
- Open one document in split view with Source and Visual modes.
- Switch between Visual and Source.
- Use Outline keyboard navigation and document-map click/drag on a long Markdown document.
- Hide a workspace file or folder, restart Folden, and verify the item remains hidden while an already open document stays open.
- Enable autosave and confirm a saved file is updated.
- Force-close the app and confirm recovery behavior.
- Modify an open file outside Folden and confirm reload/conflict behavior.
- Create, rename, move, and trash workspace files/folders.
- Confirm local images render and remote images stay blocked until allowed.
- Confirm layout and settings persist across restart.
- Uninstall Folden.
- Confirm no unexpected application files remain after uninstall.
- Reinstall Folden.
- Install over the previous version.
- Confirm user settings and recovery data survive update when expected.

## Artifacts

- Record installer file name, version, and size.
- Record installed application size.
- Confirm release artifacts have clear names with the version.
- Confirm `CHANGELOG.md` has a top entry for the release.
- Confirm binary signing status. If unsigned, record that the test build is unsigned.
- Confirm diagnostics and release artifacts do not include document content, recovery/session state, full private paths, credentials, or other user data.
