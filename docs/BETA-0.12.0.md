# Folden 0.12.0 beta

[Русский](BETA-0.12.0.ru.md) · [Release page](https://github.com/byrnane/folden/releases/tag/v0.12.0)

Folden is a local-first Markdown editor with Source and Visual modes, project folders, recovery, search, images, templates and printing. The beta adds public release preparation and native path handling for Windows, Linux and macOS.

## Changes

- English/Russian documentation, original branding and an About dialog with version, license, notices and project links.
- Target-specific native filesystem handling, compatible legacy path normalization and safer atomic file operations.
- macOS Command shortcuts and native print flow.
- Windows x64 NSIS; Linux x64 AppImage/deb; macOS Intel/Apple Silicon DMG, with locked toolchain versions and final-payload checks.
- Clear source-inspection and free-binary terms, third-party attribution, source privacy checks and a draft-only release workflow.

## Verification record

This file is an acceptance record, not a claim that all platform checks passed.

| Check                                                           | Status                                                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Local frontend quality                                          | Passed: versions, formatting, types, unused code, dependency cycles, lint and 260 unit tests         |
| Unit coverage                                                   | Passed: 260 tests; coverage thresholds met                                                           |
| Browser E2E                                                     | Passed: 99 tests; three performance cases run separately                                             |
| Performance                                                     | Passed local controlled-machine budgets and regression checks                                        |
| Native Windows fmt/clippy/tests                                 | Passed: 27 tests; one performance test intentionally ignored in the ordinary suite                   |
| Local Windows release candidate                                 | NSIS x64 built; extracted application version, publisher, resource licenses and privacy audit passed |
| Linux and both macOS CI builds                                  | Pending remote candidate CI                                                                          |
| AppImage native component license/source audit                  | Required; unknown components block release verification                                              |
| Clean native OS acceptance on four targets                      | Pending                                                                                              |
| Windows Program Files/UAC and legacy custom-path upgrade        | Pending manual acceptance                                                                            |
| Real OS clipboard, print/PDF file dialogs and physical printers | Pending manual acceptance                                                                            |
| Several real work sessions                                      | Pending; use DOGFOODING.md                                                                           |
| Public publication                                              | Requires owner approval after these gates                                                            |

These results describe the local working tree. Official packages must come from the same approved commit through candidate CI and pass native acceptance before publication. No installed application or user profile was replaced during these checks.

Windows packages are unsigned; macOS packages have an ad-hoc signature and no notarization. macOS requires 14+, Linux uses the Ubuntu 22.04/WebKitGTK 4.1 baseline, and Windows requires WebView2. Check the release origin and SHA256SUMS.txt before installation.

Visual mode edits common Markdown and retains unsupported syntax as source blocks. Moves carry sibling asset folders but do not rewrite every relative link. Printing depends on the system webview and printer; closing a dialog does not prove successful export. Keep backups of important documents.

Official binaries are free for personal and commercial work. Author source is available for inspection; redistribution and modification rights are restricted by [LICENSE.md](../LICENSE.md). User content and third-party rights are separate.

See [release procedure](RELEASE.md), [product behavior](PRODUCT.md) and [release notes](releases/v0.12.0.md). Local ignored logs/backups are not public artifacts and are not linked as proof here.
