# Folden 0.7 P0 Implementation Plan

## Summary

Folden 0.7 focuses on polishing the existing editor core: seamless Visual/Source switching, shared formatting commands, safer Markdown round-trip, better Source UX, and predictable drag and drop.

## Key Changes

- Replace Visual-only editor commands with a shared `EditorCommand` adapter contract used by both Visual and Source editors.
- Keep the document toolbar visible for Markdown files in both modes; commands dispatch to the active editor implementation.
- Preserve editor scroll, selection, and focus through the existing per-pane `EditorViewSession` state when switching modes.
- Extend Visual mode with Tiptap table and task-list support, while retaining safety gates for raw constructs that Tiptap still rewrites.
- Implement Source-mode formatting commands as direct Markdown text operations through CodeMirror transactions.
- Improve Source-mode theme styling and Visual styling for GFM tables and task lists.
- Expand drag payloads to cover tabs, Open Editors, workspace files, and external paths, with drag previews and visible drop targets.

## Implementation Order

1. Add regression coverage for no-dirty mode switching, Source toolbar commands, GFM round-trip, Markdown safety, and drag payload validation.
2. Update the editor adapter/types and shell wiring from Visual-only commands to shared editor commands.
3. Implement Source editor command handling and Visual editor table/task-list support.
4. Persist and restore view state around mode switches.
5. Add workspace-file drag support, drop-zone highlighting, tab insertion markers, and right-split drop affordance.
6. Run quality checks and desktop build before release.

## Test Plan

- `npm run test:unit`
- `npm run test:e2e`
- `npm run quality`
- `npm run app:build`
- Manual smoke: open Markdown with tables/task lists/raw HTML/frontmatter, switch modes, save, and verify unchanged/dirty behavior.

## Notes

- Tables and task lists are supported in Visual mode through Tiptap extensions.
- Raw HTML, HTML comments, frontmatter, footnotes, and custom directives remain protected by the Visual safety dialog until Folden has raw Markdown node support that can preserve them without escaping or rewriting.
- External folder drop opens a workspace through the existing dropped-path fallback.
