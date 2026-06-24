# Folden MVP

## Purpose

The first version of Folden should prove the main product idea:

* a local desktop text editor;
* fast startup;
* direct work with user-owned files;
* no hidden storage of document content;
* a simple interface that is already useful for writing.

This version is not a full block editor yet. It is the smallest useful app that can grow into one.

---

## Proposed 0.1 Scope

0.1 should be a working single-document editor:

* Tauri 2 desktop shell;
* Vue 3 + TypeScript + Vite frontend;
* basic application layout;
* custom title bar if it does not slow down the first usable build;
* source editor for plain text and Markdown;
* create a new empty document;
* open an existing text file;
* save the current file;
* show dirty state for unsaved changes;
* show the current file path when a file is open.

The goal is to make Folden able to open, edit, and save a text file before adding workspace, tabs, visual editing, or block features.

---

## Deliberately Out Of Scope For 0.1

* workspaces;
* file tree;
* tabs;
* split view;
* SQLite;
* backlinks;
* custom blocks;
* plugin API;
* visual editing with Tiptap;
* Markdown import/export pipeline;
* autosave and recovery.

These are important, but they should not delay the first usable editor.

---

## Suggested Editor Direction

Use a source editor first, then add visual editing later.

Proposed split:

* CodeMirror 6 for plain text, Markdown source mode, search, shortcuts, and large-file editing;
* Tiptap later for visual/block editing.

Reason:

* Folden must edit arbitrary text files without converting them into a structured visual document;
* source mode is a core feature, not only a fallback;
* Tiptap remains a good fit for the later visual editor, but it should not own the first plain-text editing path.

---

## First Technical Step

Create the initial app scaffold:

* npm package setup;
* Tauri 2 project setup;
* Vue 3 + TypeScript + Vite;
* minimal app screen;
* development scripts;
* basic verification command.

Current local environment check:

* Node is available;
* npm is available;
* pnpm is not currently available;
* Rust toolchain is not currently visible in PATH.

Tauri development requires Rust, so the full desktop scaffold needs Rust installed and available through `cargo`.

---

## Confirmed Decisions

* 0.1 should be a minimally useful single-file editor.
* The package manager is npm.
* The initial Tauri bundle identifier is `com.folden.editor`.
* Rust will be installed manually before the Tauri part is scaffolded.
* CodeMirror 6 is the source/plain-text editor for the first file-editing build.

---

## Pending Decisions

* How aggressive the first unsaved-changes protection should be beyond a simple confirmation dialog.

---

## Current Scaffold Status

The repository now contains a Vue/Vite/Tauri scaffold:

* minimal application shell;
* CodeMirror source editor;
* single-document text editing;
* native open/save commands;
* minimal dark theme;
* dirty state;
* document character count;
* local frontend and Tauri build scripts.

The scaffold does not yet contain workspaces, tabs, autosave, recovery, or visual/block editing.
