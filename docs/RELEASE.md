# Release procedure

[Русский](RELEASE.ru.md) · [Development](DEVELOPMENT.md)

Beta 0.12.0 is published. Its results are in the [verification record](BETA-0.12.0.md). This guide describes how to prepare later beta releases. Publishing, creating tags, and replacing an installed application require the owner's approval.

## Packages

| Platform            | Rust target              | CI runner        | Package     |
| ------------------- | ------------------------ | ---------------- | ----------- |
| Windows x64         | `x86_64-pc-windows-msvc` | `windows-2022`   | NSIS `.exe` |
| macOS Intel         | `x86_64-apple-darwin`    | `macos-15-intel` | `.dmg`      |
| macOS Apple Silicon | `aarch64-apple-darwin`   | `macos-15`       | `.dmg`      |

Windows requires WebView2; the installer can download Microsoft's runtime. macOS packages require 14 or newer. Windows packages are unsigned, and macOS packages have an ad-hoc signature without notarization. Test installation and first launch with those OS restrictions.

Linux has no official package or recorded native acceptance in this beta. The permitted [Linux self-build](DEVELOPMENT.md#linux-self-build) and dependency notices remain available under [LICENSE.md](../LICENSE.md).

## Local gates

Use the [development setup](DEVELOPMENT.md) and its pinned Node/Rust versions. From the repository root:

```text
npm ci
npm run quality
npm run test:release
npm run privacy:check
npm run licenses:generate
npm run licenses:check
npm run test:coverage
npx playwright install chromium
npm run test:e2e
npm run test:performance
```

Run native checks from `src-tauri`:

```text
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Build and verify each package on its matching OS. For Windows:

```text
npm run release:build -- --target x86_64-pc-windows-msvc
npm run release:verify -- --target x86_64-pc-windows-msvc
```

Use the macOS target from the table for each Mac build. Verification extracts the final package, checks version, architecture, licenses, and private data, and stages files in `build/release/<target>/` with `SHA256SUMS.txt`. Source maps, dumps, logs, private paths, and old smoke-test installers fail verification.

Every package includes `LICENSE.md` and generated `THIRD_PARTY_NOTICES.md`. Windows release files also include `nsis-3.11-src.tar.bz2`, the unmodified NSIS 3.11 source required by its license. Its pinned SHA-256 is included in the checksum file. The notices generator and license cache are described in [Development](DEVELOPMENT.md). Linux package checks remain in the scripts for maintenance; Linux packages are outside the official beta list.

## Isolated candidate and draft

Automatic CI on `master`, `main`, and pull requests runs the quick checks and ten smoke browser scenarios. Use **Actions → CI → Run workflow** for coverage, the complete browser suite, performance checks, and native checks.

Pushing a `release/beta-*` branch runs the full quality and test suite, builds packages, and uploads three artifacts named `folden-<target>`. Their retention is 14 days. Review the results and test the candidate packages before preparing a draft.

For the next version, use `npm run version:bump -- <version>` and complete the changelog and `docs/releases/v<version>.md`. After approval, create and push a new `v<version>` tag at the tested commit. The tag must match `package.json`; existing published tags and releases must remain unchanged.

Choose one draft path:

1. **Build from the tag.** Dispatch **Draft beta release** with the same tag as workflow ref and `tag` input. Set `create_draft=true` to create a draft prerelease after the checks pass; its default is false. Dispatch builds fresh packages, so test the final draft files on native systems before publication.
2. **Keep tested candidate packages.** Download the exact run's three artifacts into `build/release/folden-<target>/` in a clean checkout of the tested commit. Set `RELEASE_TAG` to the approved tag and `RELEASE_COMMIT` to the full tested commit SHA, then run `node scripts/release-draft.mjs`. It verifies filenames, checksums, matching license files, the clean checkout, and the remote tag's commit. It copies the tested files without rebuilding and creates a draft prerelease.

For CLI dispatch, replace `<tag>` with the approved version tag:

```text
gh workflow run release.yml --ref <tag> -f tag=<tag> -F create_draft=true
```

Configure the `release-draft` environment to require owner approval and permit version tags. Its policy checks the run's `GITHUB_REF`; use the tag as the workflow ref. Only the draft job has repository write permission. The script refuses to replace an existing release. See [repository setup](../.github/REPOSITORY_SETUP.md) for configuration.

## Native acceptance and publication

Test the final Windows package and both macOS packages. Record the package checksum, OS version, processor, and results:

- clean launch, RU/EN selection, save, and reopen;
- recovery after a forced close, external changes, and conflicts;
- local images, relative links, and file/folder moves;
- clipboard, file dialogs, printing, and PDF output;
- installation, update, and uninstall, including Windows UAC, Program Files, and an existing custom installation path.

Check the three packages, aggregate `SHA256SUMS.txt`, licenses, required NSIS source archive, and release notes in the draft. Publish only the files that passed native acceptance. Record completed checks and remaining gaps in a verification document for that version, following [BETA-0.12.0.md](BETA-0.12.0.md). Browser tests cover application flows with mocked native APIs; system dialogs and installers need these desktop checks.
