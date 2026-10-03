# Folden 0.12.0 beta

[Русский](BETA-0.12.0.ru.md) · [Release page](https://github.com/byrnane/folden/releases/tag/v0.12.0)

Folden is a local-first Markdown editor with Source and Visual modes, project folders, recovery, search, images, templates and printing. This public beta adds original branding and native path handling for Windows, Linux and macOS.

**Beta software: bugs, crashes, and data loss may occur.** Folden is provided **“AS IS”, without warranties** under [LICENSE.md](../LICENSE.md#warranty-and-liability). Keep independent backups of important documents.

## Changes

- English/Russian documentation, original branding and an About dialog with version, license, notices and project links.
- Target-specific native filesystem handling, compatible legacy path normalization and safer atomic file operations.
- macOS Command shortcuts and native print flow.
- Official Windows x64 NSIS and macOS Intel/Apple Silicon DMG packages, with locked toolchain versions and final-payload checks. Linux is available only as a private self-build of the unmodified source.
- Clear source-inspection and free-binary terms, third-party attribution, source privacy checks and a release workflow with draft review.

## Verification record

Automated results refer to commit `9013e8e45c6b379db4be911dbd9fd94256a56b83` and [CI run 37026856164](https://github.com/byrnane/folden/actions/runs/37026856164). Manual results are the owner's report, not independent confirmation of every supported OS/device.

| Check                                                           | Status                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| CI frontend quality                                             | Passed: versions, formatting, types, unused code, dependency cycles, lint and 260 unit tests           |
| Unit coverage                                                   | Passed: 260 tests; coverage thresholds met                                                             |
| Browser E2E                                                     | Passed in CI: 100 tests; three performance cases run separately                                        |
| Performance                                                     | Passed in CI: frontend regression, native 100k workspace check and three browser performance cases     |
| Native Windows fmt/clippy/tests                                 | Passed: 27 tests; one performance test intentionally ignored in the ordinary suite                     |
| Windows CI package                                              | NSIS x64 built; extracted application version, publisher, resource licenses and privacy audit passed   |
| Both macOS CI builds                                            | Passed: Intel/Apple Silicon DMG; native fmt/clippy/tests, package checks and ad-hoc signature verified |
| Downloaded final packages                                       | Passed: all three file sets, SHA-256, legal resources, executable architectures and payload privacy    |
| Owner's Windows/macOS checklist                                 | Reported OK on 2026-10-03; machine/OS details and separate confirmation of both Mac CPUs not provided  |
| Linux packages and native acceptance                            | Outside this beta; private self-build only                                                             |
| Windows Program Files/UAC and legacy custom-path upgrade        | No separate per-scenario record                                                                        |
| Real OS clipboard, print/PDF file dialogs and physical printers | No separate per-scenario record                                                                        |
| Several real work sessions                                      | No separate record in DOGFOODING.md                                                                    |
| Beta publication                                                | Owner approved on 2026-10-03 with the beta/AS IS limitations                                           |

The release uses the checked files from that CI run without rebuilding. Native coverage is limited to the owner's overall Windows/macOS report; it does not establish a complete Windows 10/11 and macOS 14+ hardware matrix.

Windows packages are unsigned; macOS packages have an ad-hoc signature and no notarization. macOS requires 14+ and Windows requires WebView2. Check the release origin and SHA256SUMS.txt before installation. Linux has [private self-build instructions](DEVELOPMENT.md#linux-self-build) and no official beta package.

Visual mode edits common Markdown and retains unsupported syntax as source blocks. Moves carry sibling asset folders but do not rewrite every relative link. Printing depends on the system webview and printer; closing a dialog does not prove successful export. Keep backups of important documents.

Official binaries are free for personal and commercial work. Author source is available for inspection with a limited private Linux self-build permission; redistribution and modification rights are restricted by [LICENSE.md](../LICENSE.md). User content and third-party rights are separate.

See [release procedure](RELEASE.md), [product behavior](PRODUCT.md) and [release notes](releases/v0.12.0.md). Local ignored logs/backups are not public artifacts and are not linked as proof here.
