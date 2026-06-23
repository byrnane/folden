# Folden Tech Stack

## Overview

Folden is a local-first desktop application built using web technologies for the user interface and Rust for native platform integration.

The primary goals of the stack are:

* performance;
* simplicity;
* maintainability;
* cross-platform support;
* local-first architecture;
* minimal runtime overhead.

---

# Desktop Platform

## Tauri 2

Purpose:

* desktop application shell;
* native window management;
* filesystem access;
* OS integration;
* application packaging.

Why:

* significantly lighter than Electron;
* uses native WebView;
* strong Rust integration;
* cross-platform support.

---

# Backend

## Rust

Purpose:

* filesystem operations;
* workspace management;
* indexing;
* search;
* persistence;
* platform integrations.

Why:

* performance;
* reliability;
* memory safety;
* excellent Tauri ecosystem.

Rust should contain business logic that does not belong in the UI layer.

---

# Frontend

## Vue 3

Purpose:

* application UI;
* layouts;
* panels;
* dialogs;
* editor integration.

Why:

* familiar ecosystem;
* simple mental model;
* good TypeScript support.

---

## TypeScript

Purpose:

* application logic;
* domain models;
* editor integrations.

Why:

* better maintainability;
* safer refactoring.

---

## Vite

Purpose:

* development server;
* frontend build pipeline.

Why:

* fast startup;
* excellent Vue integration.

---

# Editor Engine

## Tiptap

Purpose:

* visual editor;
* block editing;
* editor extensions;
* custom nodes.

Why:

* built for extensibility;
* excellent UX foundation;
* easier than working directly with ProseMirror.

---

## ProseMirror

Purpose:

* document model;
* selection system;
* transactions;
* editing engine.

Why:

* battle-tested editor foundation;
* powers many modern editors.

Direct ProseMirror usage should be minimized when possible.

Prefer Tiptap abstractions first.

---

# Document Formats

## Markdown

Primary exchange format.

Requirements:

* readable outside Folden;
* portable;
* editable in any text editor.

---

## Folden Extended Markdown

Internal enhanced document format.

Goals:

* preserve markdown compatibility;
* support custom blocks;
* support metadata;
* support future extensions.

The exact syntax will be defined later.

---

# Parsing & Transformation

## Unified

Purpose:

* markdown parsing pipeline;
* AST transformations;
* import/export processing.

---

## Remark

Purpose:

* markdown AST processing;
* custom syntax support.

---

# Persistence

## SQLite

Purpose:

* document index;
* backlinks;
* search cache;
* metadata;
* application state.

Documents themselves are not stored in SQLite.

SQLite stores supporting data only.

Files remain the source of truth.

---

# State Management

## Pinia

Purpose:

* UI state;
* workspace state;
* editor state.

Why:

* lightweight;
* official Vue ecosystem solution.

---

# Utilities

## VueUse

Purpose:

* common Vue composables;
* storage;
* shortcuts;
* clipboard;
* window management helpers.

Why:

* reduces boilerplate.

---

# UI Components

## Reka UI

Purpose:

* dialogs;
* menus;
* dropdowns;
* popovers;
* accessibility primitives.

Why:

* headless approach;
* fully customizable appearance.

---

## Floating UI

Purpose:

* bubble menus;
* slash menus;
* tooltips;
* floating panels.

---

# Search

## Ripgrep

Purpose:

* workspace-wide text search.

Why:

* extremely fast;
* proven solution;
* already familiar to many developers.

---

# Styling

## UnoCSS

Purpose:

* utility-first styling.

Why:

* lightweight;
* fast builds;
* less verbose than traditional CSS architectures.

---

# Testing

## Vitest

Purpose:

* unit tests;
* utility tests;
* business logic tests.

---

## Playwright

Purpose:

* end-to-end testing;
* UI testing.

---

# Build Targets

## Supported Platforms

Version 1.0:

* Windows

Future:

* macOS
* Linux

---

# Architectural Principles

## Local First

All user content is stored locally.

No cloud dependency is required.

---

## File First

Files are the source of truth.

Database data must always be reconstructable from files.

---

## Block First

Internally documents are represented as blocks.

Users may work with:

* visual mode;
* source mode.

Both modes operate on the same document.

---

## Markdown Friendly

Users should never feel trapped inside Folden.

Documents must remain understandable outside the application.

---

# Out Of Scope

Not planned for 1.0:

* cloud sync;
* collaboration;
* mobile applications;
* AI features;
* online accounts;
* telemetry requirements.
