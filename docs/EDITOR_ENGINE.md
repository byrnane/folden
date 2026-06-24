# Editor Engine Notes

## Goal

Folden needs two editing experiences:

* source editing for plain text and Markdown;
* visual editing for structured Markdown and future blocks.

These modes should share the same file content, but they do not have to use the same editor engine internally.

---

## Current 0.1 Position

Start with source editing.

The first useful version should open, edit, and save local text files before Folden grows a visual document model.

The first scaffold used a native `textarea` only as a temporary baseline. It proved layout and state flow, not the final editing engine.

CodeMirror 6 is now the first source editor implementation.

---

## Option 1: Native Textarea

Pros:

* no dependency;
* trivial integration;
* good enough for the first shell and state checks;
* easy to delete.

Cons:

* weak keyboard/editing features;
* no syntax highlighting;
* no real search integration;
* poor fit for large text editing;
* hard to grow into a serious source editor.

Decision:

* removed from the main editing surface;
* still useful only as a possible fallback in isolated tests or prototypes.

---

## Option 2: CodeMirror 6

Pros:

* built for source editing;
* good TypeScript support;
* strong state and transaction model;
* modular extensions;
* Markdown language support;
* search, history, keymaps, selections, and gutters are normal editor features;
* suitable for plain text without forcing a rich document model.

Cons:

* another dependency;
* needs a small Vue wrapper component;
* its internal document state must be synchronized carefully with Folden file state;
* not a visual block editor by itself.

Best use in Folden:

* plain text files;
* Markdown source mode;
* search and replace;
* source-side shortcuts;
* large-document editing.

Implementation notes:

* keep the wrapper small and local to the editor surface;
* keep document text ownership in the parent app state;
* avoid building a generic editor abstraction until source/visual switching actually exists.

---

## Option 3: Tiptap

Pros:

* strong foundation for rich and visual editing;
* Vue integration exists;
* built on ProseMirror;
* good fit for headings, lists, quotes, code blocks, links, and future custom blocks.

Cons:

* not ideal as the first arbitrary plain-text editor;
* works with a structured document model, not raw file text;
* Markdown round-trip behavior must be designed, not assumed;
* adding it too early can make file-first behavior harder to reason about.

Best use in Folden:

* visual Markdown editing;
* block editing;
* custom blocks;
* slash commands;
* bubble menus and formatting toolbar.

Recommended timing:

* add after the source editor and file ownership are stable;
* define Markdown import/export rules before making it the main editing surface.

---

## Recommendation

Use two engines over time:

* CodeMirror 6 for source/plain-text editing;
* Tiptap for later visual/block editing.

This keeps Folden honest about its file-first promise:

* plain text remains plain text;
* Markdown source remains directly editable;
* visual editing can grow without pretending every text file is a rich document.

Do not add both engines in 0.1 immediately. CodeMirror is now in place for source editing. Add Tiptap later when the visual editor becomes the actual task.
