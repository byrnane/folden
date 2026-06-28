# Folden v0.3 Performance Baseline

Updated: 2026-06-28

## Automated

| Metric | Command | Result |
| --- | --- | --- |
| Frontend JS bundle | `npm run build` | `dist/assets/index-BAGKb_wa.js` = `1214.17 kB` (`398.74 kB gzip`) |
| Frontend CSS bundle | `npm run build` | `dist/assets/index-NTM8WqCV.css` = `12.41 kB` (`3.06 kB gzip`) |
| Tauri release build | `npm run app:build` | `build/desktop/release/app.exe` produced successfully |

## Manual Baseline Procedure

Run these on the same Windows machine after a clean app start.

| Metric | Procedure | Current status |
| --- | --- | --- |
| Cold startup time | Launch `build/desktop/release/app.exe`, measure from process start to visible editor shell. Repeat 5 times and record median. | Not run in this automated pass |
| Workspace open without recursive scan | Open a workspace with nested folders and verify only root children appear before any folder expansion. Record time to first root render. | Not run in this automated pass |
| Open 100 KB Markdown file | Use `Open`, measure from file pick confirmation to visible editor content. Repeat 5 times. | Not run in this automated pass |
| Open 1 MB Markdown file in Source | Open the file, switch to Source if needed, measure until editor is responsive. Repeat 5 times. | Not run in this automated pass |
| Switch Source -> Visual for supported Markdown | With the same file or a smaller supported sample, measure mode switch until visual editor is interactive. | Not run in this automated pass |
| Typing latency in 1 MB Source document | Place caret near the end of the document and type a short burst. Observe whether latency is noticeable and record with the same machine context. | Not run in this automated pass |
| Memory with one and two panes | Compare working set after opening one large document in one pane and the same document in split view. | Not run in this automated pass |

## Notes

- Task 10 switches the workspace tree to per-directory loading. The expected manual verification is that opening a workspace loads only `list_directory(workspaceId, "")`, and expanding a folder loads that folder's direct children on demand.
- If a branch is already expanded, branch refresh should preserve visible descendants by reloading loaded child branches in depth order.
