# Using Folden for daily work

[Русский](DOGFOODING.ru.md) · [Beta verification](BETA-0.12.0.md)

Record real work in Folden here. No daily-use sessions have been recorded for beta 0.12.0 yet. Automated tests and release acceptance results are kept in the beta verification record.

## Sessions

Add one entry per work session. Use a neutral project label and synthetic examples in this public log; keep personal paths and documents private.

```text
Date:
Version:
OS and processor:
Project label:
Duration:
Scenarios used:
What worked:
Problems and reproduction steps:
```

## Scenarios to cover

Across several sessions, check:

- a real Markdown project, a large folder, many tabs, and a long document;
- one document in two panes, Source/Visual switching, editing, undo/redo, and autosave;
- recovery after a forced close, external changes, and simultaneous-edit conflicts;
- create, rename, move, and trash operations; relative links and sibling assets after moves;
- project hiding through `.folden/workspace.json`, then reopen and restart;
- outline tracking and keyboard navigation, document-map clicks and dragging in both modes;
- quick open, project search, find/replace, templates, and back/forward navigation;
- image import, clipboard paste, and remote-image permission;
- saved language, layout, and settings; native printing/PDF of a long document;
- several hours of use, memory consumption, and visible slowdown.

## Issues

Report reproducible problems through [GitHub's issue forms](https://github.com/byrnane/folden/issues/new/choose). Include the version, OS, steps, expected result, and actual result. State whether the problem risks data loss or blocks daily work. Link the issue from the session entry.

For a feature suggestion, describe the writing task it would improve. Follow [SECURITY.md](../SECURITY.md) for vulnerabilities and review screenshots and diagnostics before sharing them.
