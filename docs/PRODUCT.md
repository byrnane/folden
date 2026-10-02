# Folden Product

Folden is a local-first, visual-first desktop writing editor built on Markdown. It is meant to feel like a focused tool for articles, scripts, documentation, notes, and specifications while preserving the user's direct control over files and folders.

## Audience

Folden is built for people who write and maintain text as part of real work:

- writers of articles, scripts, documentation, notes, and specifications;
- technical writers and game designers working with structured long-form text;
- Markdown users who want a strong visual block editor while retaining access to source text.

## Principles

### Local-first

Folden does not require accounts, cloud storage, telemetry, or a remote service to edit user documents. User content lives on the user's device and is opened from normal filesystem paths.

### File-first

Files are the source of truth. Folden can keep session state, recovery snapshots, settings, diagnostics, and caches, but the document body belongs in the user's files, not in a hidden application database.

### Markdown-friendly

Markdown is the main interchange format. A document should remain useful in another editor, a Git diff, a static-site pipeline, or a plain text viewer.

### Direct before clever

Folden should prefer clear, predictable workflows: open a folder, open a file, edit, save, recover if something goes wrong. Automation such as autosave and recovery must support that workflow instead of hiding it.

## User-owned Data

User-owned data includes:

- opened text and Markdown files;
- workspace folders and their children;
- file names, relative paths, line endings, UTF-8 BOM state, and on-disk fingerprints;
- unsaved scratch document content until the user discards it or saves it.

Application-owned supporting data includes:

- UI session layout;
- recent workspaces;
- recovery snapshots;
- settings such as autosave and workspace ignored names;
- bounded logs and exported diagnostic reports.

Supporting data must not become the canonical copy of a saved document.

## Current Product Surface

Folden currently supports:

- native text file open/save;
- workspace folder browsing, lazy tree loading, recent workspaces, ignored names, workspace-level hidden paths in `.folden/workspace.json`, and workspace file operations;
- multiple documents with tabs, tab reorder, tab transfer between panes, and Open Editors;
- two-pane split view with shared document sessions and persisted split ratio;
- activity rail, workspace and settings sections, focus mode, resizable sidebar and rail, density settings, and layout reset;
- a visual-first Markdown editor with Tiptap;
- a secondary Source mode with CodeMirror for inspecting and precisely editing Markdown;
- Markdown outline navigation with active-section highlighting, keyboard navigation, and a resizable document map in Source and Visual modes;
- explicit dirty state, undo, redo, save, save as copy, and close protection;
- autosave for saved documents when enabled, including delay, window-blur, and document-switch settings;
- recovery for scratch and saved documents after an unexpected shutdown;
- external change detection, missing-file states, stale-save protection, and conflict resolution;
- local diagnostics export, log access, and toast feedback;
- remote image blocking in Visual mode until the user allows images for the document.

The 0.11 Windows beta also includes:

- quick document open by file name or path, project search, and in-document find/replace;
- empty document, note, game design document, and video script templates;
- relative Markdown document links and back/forward navigation;
- local image import and clipboard paste into a document assets folder;
- explicit file/folder moves, with no automatic rewriting of relative links;
- Russian and English interface languages detected on first use and saved in Settings;
- printing and PDF output through the system print dialog using an immutable document snapshot.

New settings enable autosave for existing files. An explicitly disabled autosave setting stays disabled. Unsaved scratch documents still require a first manual save. Recovery keeps every active dirty document; deferred recovery entries are deduplicated and bounded separately.

Project search scans supported UTF-8 text files, respects project ignores, and reports partial results or skipped files. It is bounded to 2 MiB per searched file, 5,000 matches, 100,000 directory entries, and 32 levels of depth. Symbolic links are not followed.

Print output uses a light paper layout. Unsupported Markdown is displayed as source blocks, and unavailable images get a placeholder. Pagination, printer selection, PDF destination, margins, and successful completion are controlled by the system dialog. Moving a `.md` or `.markdown` file carries its sibling `<stem>.assets` folder when present; a conflicting destination assets folder blocks the move. Document contents and other image/link paths are not rewritten; review relative references afterward.

## Boundaries

Folden is not currently:

- a cloud notes platform;
- a collaborative editor;
- a task tracker, CRM, wiki service, or project-management system;
- a mobile application;
- an online account system;
- a database-backed document store;
- a plugin platform;
- an AI writing product;
- an arbitrary split-grid editor;
- an IDE or code-centric development environment.

Future features should keep the same product contract: user documents stay file-first and readable outside Folden.

## Role of Markdown and Plain Text

Markdown files open in Visual mode by default. Source remains a complete but secondary view for inspecting and precisely editing Markdown. Visual editing is the primary product experience and should expose documents as clear, movable blocks without taking ownership away from the source file. Raw HTML, HTML comments, frontmatter, footnotes, and custom directives must survive as editable source blocks instead of forcing the whole document out of Visual mode. Images mixed into text that cannot fit the Visual block schema also remain editable source blocks with their Markdown preserved.

Plain text files remain plain text files. Folden should not force arbitrary text into a Markdown or block-document model just because the application has a visual editor.

## Success Criteria

Folden is succeeding when:

- users can trust it with real local documents;
- common editing, saving, closing, and recovery flows are predictable;
- Markdown remains portable and reviewable outside the app;
- external file changes are visible and recoverable instead of silently overwritten;
- the app starts quickly enough to be used as a daily editor;
- adding features does not blur ownership of user content.
