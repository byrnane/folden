# Release procedure

[Русский](RELEASE.ru.md)

Folden 0.12 is a beta. The workflow prepares a **draft prerelease** for owner review. Publishing, replacing public history, creating the version tag, and installing over a live profile are separate owner decisions.

## Packages

| Target              | Runner         | Artifact  |
| ------------------- | -------------- | --------- |
| Windows x64         | Windows 2022   | NSIS .exe |
| macOS Intel         | macOS 15 Intel | .dmg      |
| macOS Apple Silicon | macOS 15 ARM   | .dmg      |

macOS deployment minimum is 14. Windows requires WebView2; its installer can download Microsoft's runtime. Windows packages are unsigned. macOS packages are ad-hoc signed and are not notarized. This matrix defines the supported baseline, not evidence that a native smoke test passed.

Linux is outside official beta packaging and native acceptance. The [private self-build instructions](DEVELOPMENT.md#linux-self-build) preserve Linux source support and dependency notices without promising official packages.

## Local gates

Use Node 24.16.0 and Rust 1.96.0 from the checked-in version files. Run:

```text
npm ci
npm run quality
npm run test:release
npm run privacy:check
npm run test:coverage
npm run test:e2e
npm run test:performance
```

Generate and check notices from the repository root. The generator fetches locked Cargo sources, reads platform dependency graphs (including Linux self-builds) and verifies upstream license inputs; generated legal documents are included in packages, not committed:

```text
npm run licenses:generate
npm run licenses:check
```

From src-tauri:

```text
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

Build each package on its matching OS:

```text
npm run release:build -- --target x86_64-pc-windows-msvc
npm run release:verify -- --target x86_64-pc-windows-msvc
```

Use x86_64-apple-darwin or aarch64-apple-darwin for the matching macOS architecture. Verification extracts the **final package**, checks version, architecture, legal resources and privacy, and stages only reviewed formats with SHA256SUMS.txt. Source maps, dumps, logs, private build paths and old smoke installers fail the gate.

THIRD_PARTY_NOTICES.md is a conservative npm/Cargo inventory with runtime/build scopes. Windows distribution additionally contains the unmodified NSIS 3.11 corresponding source archive, nsis-3.11-src.tar.bz2, with its pinned SHA-256 in the same checksum file. It accompanies the installer under NSIS/LZMA terms and is not an installation package. Linux release scripts retain their payload audit guards, but no Linux package enters this beta's official artifact list.

## Isolated candidate and draft

CI runs on master/main and pull requests. The package workflow checks and builds pushed release/beta-* candidate branches. Candidate pushes create workflow artifacts only; they do not create a release.

After reviewing the sanitized tree/history and approving a candidate push, run CI and native checks on that exact commit. Preserve original Git and source backups before any public-history replacement. Verify author/committer metadata and all reachable public branches/tags, not just HEAD. Removing material from a replacement history cannot remove copies already downloaded or cached elsewhere.

After explicit approval, create the existing v0.12.0 tag at the tested commit. Manually dispatch **Draft beta release** with that tag as both the workflow ref and tag input. The web UI dispatch button depends on default-branch workflow availability. A candidate push registers/runs this workflow; after that, use CLI/API dispatch with the exact approved tag as workflow ref if the UI button is unavailable. For example: `gh workflow run release.yml --ref v0.12.0 -f tag=v0.12.0 -F create_draft=true`. If GitHub rejects dispatch, retain the candidate artifacts for review rather than changing public history just to expose a button. The optional create_draft input is false by default. Only the final draft job has repository write permission; it creates a draft prerelease, refuses to replace an existing release, and never publishes it. Configure the release-draft environment with owner approval before enabling this step.

Review all three packages, the aggregate checksum file, license/notices, and [release notes](releases/v0.12.0.md). Publish only after native acceptance on the Windows and macOS targets: clean launch, save/reopen, RU/EN, recovery/conflicts, local images/links, printing, installation/update/uninstall. Record results in [BETA-0.12.0.md](BETA-0.12.0.md); browser mocks do not prove native dialogs or installer behavior.

A dispatched build creates fresh packages: native-test the **final draft files** before publication, even if an earlier candidate was accepted. To preserve already accepted candidate packages instead, download that exact run's three artifacts into `build/release/folden-<target>/` in a clean checkout of the tested commit. After tag approval, set `RELEASE_TAG=v0.12.0` and `RELEASE_COMMIT=<tested SHA>`, then run `node scripts/release-draft.mjs`. It verifies canonical filenames, each downloaded checksum, matching legal resources, a clean checkout and the remote tag's immutable commit. It copies those accepted bytes without rebuilding, and creates only a draft prerelease. Publish only the exact native-accepted files.

## Repository settings

Review [the settings payload](../.github/repository-settings.json) and [setup instructions](../.github/REPOSITORY_SETUP.md). Repository metadata, topics, private vulnerability reporting, secret scanning, push protection and the release-draft environment were applied and verified on 2026-10-02. Branch protection remains deferred until the separately approved public-history replacement. History replacement, commits, pushes, tags and publication remain separately approved steps.

The official binary may be used free of charge for personal and commercial work. Author source is provided for inspection with a limited private Linux self-build permission under [LICENSE.md](../LICENSE.md). Third-party terms and user content ownership are separate.
