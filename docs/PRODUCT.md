# How Folden works

English · [Русский](PRODUCT.ru.md)

This document describes the current application's behavior for developers. The [README](../README.md) covers installation and features, and [Architecture](ARCHITECTURE.md) explains the code structure.

## Files and application data

Saved documents are ordinary Markdown or text files chosen by the user. Their contents, names, folders, and images belong to the user and remain readable outside Folden.

The application stores settings, recent folders, session layout, recovery copies, and bounded diagnostic logs separately. The saved file remains the source for its document. Recovery copies retain unsaved work until the user restores or discards it.

Saving preserves the file's line endings and UTF-8 BOM. Folden records the file's size and modification time, checks them before saving, and writes the replacement atomically. A detected external change produces a conflict for the user to resolve. Missing files also have a visible state.

## Editors and panes

Markdown opens in Visual mode by default; the default can be changed in Settings. Visual mode edits blocks such as paragraphs, headings, lists, tables, and code. Source mode gives access to the Markdown text. Plain text files open in Source mode and keep their text format.

Opening a document or switching modes preserves its Markdown. Visual edits affect the changed blocks and retain the source of untouched blocks. Raw HTML, HTML comments, frontmatter, footnotes, reference definitions, and custom directives remain editable source blocks. Images mixed into text that cannot fit the visual editor's block schema are preserved in source blocks too.

A document has one content state and one undo/redo history shared by both modes and panes. Each pane keeps its own editing mode, selection, and scroll position. Tabs can be reordered or moved between the two panes. The application remembers the tab layout, active documents, modes, and split ratio.

## Saving, closing, and recovery

Autosave is enabled by default for files already on disk. Settings control the delay and saving on window blur or document switch. A previously disabled setting stays disabled. New drafts need a first manual save to choose a path.

Folden tracks unsaved changes. Closing a document or the window with unsaved changes asks the user to save, discard, or cancel. Save as copy writes a separate file. External changes can be compared and resolved before writing.

Recovery retains every active document with unsaved changes, including drafts and edits to saved files. After an unexpected shutdown, the user can restore or discard those copies. Deferred recovery copies are deduplicated and limited separately from active documents.

## Project folders, search, and links

The folder tree loads directories as they are opened. Ignored names come from application settings. Paths hidden for a particular project are stored in `.folden/workspace.json`; the `.folden` folder is hidden from the tree. File deletion uses the system trash.

Project search reads supported UTF-8 text files and respects ignored names and hidden paths. It can be cancelled and reports incomplete results and skipped files. Symbolic links are not followed. Search limits are:

| Limit             | Value   |
| ----------------- | ------- |
| Searched file     | 2 MiB   |
| Matches           | 5,000   |
| Directory entries | 100,000 |
| Directory depth   | 32      |

Relative Markdown links are resolved within the open project, with back/forward navigation. Local image import and clipboard paste store images beside the saved document in `<stem>.assets`.

Moving a `.md` or `.markdown` file carries its sibling `<stem>.assets` folder if present. An existing destination assets folder blocks the move. Document contents and other image or link paths stay unchanged; relative references need review after a move.

## Printing and network access

Printing takes an immutable snapshot of the current document and uses a light page layout. Unsupported Markdown appears as source blocks, and unavailable images get placeholders. Pagination, printer selection, PDF destination, margins, and completion depend on the system print dialog and webview. Closing the dialog alone does not confirm a successful print or export.

Editing works without an account or internet connection. Folden has no telemetry or cloud sync. Remote images in Visual mode need permission for the document. Help links open GitHub in the browser. Logs stay local, and exporting diagnostics requires a separate action.
