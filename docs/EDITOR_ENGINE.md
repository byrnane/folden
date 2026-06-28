# Editor Engine Notes

## Current Direction

Folden now uses two editor engines:

* Tiptap 3 for visual Markdown editing;
* CodeMirror 6 for source/plain-text editing.

The saved document content remains a plain text string. Markdown files open in visual mode by default and can switch to source mode. Non-Markdown text files stay in source mode.

## Tiptap

Tiptap owns the visual Markdown surface.

Current supported Markdown scope:

* paragraphs;
* headings;
* bold, italic, strike, inline code;
* links;
* images by URL;
* bullet and ordered lists;
* blockquotes;
* code blocks;
* horizontal rules.

The editor uses `@tiptap/markdown` to parse Markdown into the ProseMirror document and serialize it back with `editor.getMarkdown()`.

## CodeMirror

CodeMirror remains the source editor.

It is used for:

* Markdown source mode;
* plain text and code-like text files;
* future search/replace and source-oriented shortcuts.

## Boundaries

Still out of scope:

* custom Folden blocks;
* tables;
* task lists;
* slash commands;
* arbitrary rich embeds;
* document database ownership.

Files are still the source of truth. SQLite, when added later, should index and cache metadata only.
