# Folden Dogfooding

Use this file to record real daily usage before starting the next feature cycle.

## Sessions

Add one entry per real work session:

```text
Date:
Version:
Environment:
Project/folder:
Duration:
Scenarios used:
Notes:
```

Required coverage:

* several full work sessions;
* real Markdown project;
* folder with many files;
* long session with multiple tabs;
* one document open in split view with Source and Visual modes;
* Visual/Source switching;
* autosave in real work;
* recovery after forced app close;
* external change of an open file;
* conflict during simultaneous editing;
* workspace rename, create, delete, and move scenarios;
* large Markdown files;
* outline active-section tracking, keyboard navigation, and document-map click/drag in both editor modes;
* workspace-level hiding through `.folden/workspace.json`, including reopen and restart;
* local and remote images;
* layout and settings persistence between launches;
* several hours of use;
* memory use and visible slowdown check.

## 0.7 Automated Closeout

The 0.7 release gate covered the editor regression checklist with automated E2E tests: Visual/Source no-dirty switching, instant Visual edits before Source, kitchen-sink save/reopen, raw HTML/frontmatter Source preservation, Source link/image dialogs, table/task-list editing, scroll/selection preservation, and tab/workspace/external drag/drop payloads.

This does not replace real dogfooding or installer smoke testing. Record those sessions separately below.

## 0.8 Automated Closeout

The 0.8 release gate covers duplicate document labels, workspace-level ignores, muted folders, compact workspace actions, Outline navigation, document-map click/drag, persisted navigation widths, and plain-text exclusion. 0.8.2 additionally covers the active Outline item and keyboard navigation.

## Issue Backlog

Add only reproducible bugs or items with clear user value. Keep bug reports separate from future feature ideas.

### Template

```text
ID:
Type: bug | UX | performance | enhancement
Version:
Environment:
Data-loss risk: yes | no
Daily-use blocker: yes | no
Steps:
Expected:
Actual:
Evidence:
Status: open | fixed | wontfix
```

## Known Issues

No dogfooding issues recorded yet.
