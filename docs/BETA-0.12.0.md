# Folden 0.12.0: test results

English · [Русский](BETA-0.12.0.ru.md) · [Release](https://github.com/byrnane/folden/releases/tag/v0.12.0)

Beta 0.12.0 was published on 2026-10-03. This record describes the checks on its Windows x64 and macOS Intel/Apple Silicon packages. Features and installation instructions are in the [README](../README.md); changes are in the [release notes](releases/v0.12.0.md).

## Automated checks

Results refer to commit `9013e8e45c6b379db4be911dbd9fd94256a56b83` and [CI run 37026856164](https://github.com/byrnane/folden/actions/runs/37026856164). The release contains the checked files from that run, without a rebuild.

| Check               | Recorded result                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Frontend quality    | Passed: versions, formatting, types, unused code, dependency cycles, lint, and 260 unit tests             |
| Unit coverage       | Passed: all configured thresholds met                                                                     |
| Browser tests       | Passed: 100 tests                                                                                         |
| Performance         | Passed: frontend regression, native workspace test with 100,000 entries, and three browser scenarios      |
| Rust on Windows     | Formatting, clippy, and 27 tests passed; the performance test runs separately                             |
| Windows package     | NSIS x64 built; extracted app version, publisher, licenses, and privacy checks passed                     |
| macOS packages      | Intel and Apple Silicon DMGs built; Rust checks, package checks, and ad-hoc signature verification passed |
| Downloaded packages | All three sets passed SHA-256, license, executable architecture, and privacy checks                       |

## Tests on real systems

The owner reported successful Windows and macOS checks on 2026-10-03. The record does not include machine models, OS versions, or separate results for both Mac processor types.

The following need separate records:

- Windows installation with UAC in Program Files and an upgrade from an older installation with a custom path.
- OS clipboard, print/PDF dialogs, and physical printing.
- Several work sessions following the [daily-use checklist](DOGFOODING.md).

Linux has no official package or recorded testing on a real system for this beta. See the [Linux self-build instructions](DEVELOPMENT.md#linux-self-build).

## Limits

Browser tests use a simulated native API. System dialogs, installers, and printing require checks on real systems. The recorded manual results cover the owner's machines; other Windows 10/11 and macOS 14+ configurations remain unverified.

The beta may contain bugs, crash, or lose data. Keep separate backups of important documents. See the [usage terms](../LICENSE.md#warranty-and-liability).

See [Release](RELEASE.md) for the build procedure and [Product behavior](PRODUCT.md) for editing, file moves, and printing.
