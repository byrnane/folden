# Folden v0.4 Release Measurements

Updated: 2026-06-30

## Automated Checks

| Metric | Command | Current status |
| --- | --- | --- |
| Version alignment | `npm run version:check` | Run as part of the release gate |
| Frontend type safety | `npm run vue:typecheck` | Run as part of the release gate |
| Unit coverage | `npm run test:unit` | Run as part of the release gate |
| Browser-level user flows | `npm run test:e2e` | Run as part of the release gate |
| Frontend production build | `npm run vue:build` | Run as part of the release gate |
| Native formatting | `cd src-tauri && cargo fmt --check` | Run as part of the release gate |
| Native linting | `cd src-tauri && cargo clippy -- -D warnings` | Run as part of the release gate |
| Native tests | `cd src-tauri && cargo test` | Run as part of the release gate |
| Desktop release build | `npm run app:build` | Run as part of the release gate |

## Manual Windows Measurements

Run these against `build/desktop/release/app.exe` on the same Windows machine after a fresh build.

| Metric | Procedure | Result |
| --- | --- | --- |
| Cold startup time | Launch the exe, measure from process start to visible editor shell. Repeat 5 times and record the median. | Manual check required |
| Workspace open | Open a workspace with nested folders, measure time from folder confirmation to root tree render. Verify nested folders stay lazy until expanded. | Manual check required |
| File open | Open a 100 KB Markdown file and measure time from picker confirmation to visible editor content. Repeat 5 times. | Manual check required |
| Editor switch | Open supported Markdown, switch Source -> Visual and measure time until the Visual editor is interactive. | Manual check required |
| Typing latency | Open a 1 MB Markdown file in Source, type a short burst near the end, and record whether latency is noticeable. | Manual check required |
| Memory | Compare working set with one large document in one pane and the same document in split view. | Manual check required |

## Release Notes

- The browser E2E layer covers the 0.4 flows that can be simulated safely: lazy workspace loading, split Source/Visual sync, settings, recovery, autosave, conflicts, remote images, window close confirmation, and diagnostics export.
- Native close behavior, Windows window lifecycle, visual flicker after save, and coarse memory observations still require manual exe smoke testing before the final patch bump and commit.
- Diagnostic export is local-only and must not include document content, recovery snapshots, session state, or full user paths.
