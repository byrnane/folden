# Folden — future performance plan

Performance work not required by the 0.9 block editor stays in a separate release.

## Document navigation

- Replace the per-line document-map DOM with a bounded canvas or aggregated representation.
- Move outline, map, and word-count analysis off the editing hot path.
- Keep click, drag, resize, and early-scroll feedback covered by regression tests.

## Large workspaces

- Remove recursive descendant probes from ordinary directory listing.
- Review recursive watcher scope and ignore handling.
- Add cancellable, bounded traversal primitives for workspace-wide features.
- Benchmark representative workspaces up to 100,000 entries.
