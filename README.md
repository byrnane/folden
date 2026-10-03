![Folden Markdown editor](docs/assets/banner.svg)

English · [Русский](README.ru.md)

Folden is a desktop editor for Markdown and plain text. Use it for notes, articles, scripts, documentation, and game design documents. Open files or a project folder, edit visually or in source mode, and keep your documents on your computer.

## Beta 0.12.0

[Download Folden 0.12.0](https://github.com/byrnane/folden/releases/tag/v0.12.0) · [Release notes](docs/releases/v0.12.0.md) · [Verification status](docs/BETA-0.12.0.md)

**This beta may contain bugs, crash, or lose data.** Keep independent backups of important documents. Folden is provided **“AS IS”, without warranties**, under the [usage terms](LICENSE.md#warranty-and-liability).

The release includes three installation packages, `SHA256SUMS.txt`, license texts, and the NSIS source archive required by the installer's license.

| System              | Package          | Requirements      |
| ------------------- | ---------------- | ----------------- |
| Windows x64         | `.exe` installer | Windows 10 or 11  |
| macOS Apple Silicon | ARM64 `.dmg`     | macOS 14 or newer |
| macOS Intel         | x64 `.dmg`       | macOS 14 or newer |

### Installation

**Windows:** run the `.exe` installer. WebView2 is required; the installer can download Microsoft's runtime if it is missing. Updates to an official installation keep the application identifier and user settings. The beta is unsigned, so Windows may show an unknown-publisher or SmartScreen warning. Verify the download source and checksum before running it.

**macOS:** choose the DMG for your processor, open it, and drag Folden into **Applications**. The beta has an ad-hoc signature and is not notarized. If macOS blocks the first launch, verify the source and checksum, then use **System Settings → Privacy & Security → Open Anyway**. See [Apple's instructions](https://support.apple.com/en-us/102445).

**Linux:** this beta has no official package, and testing on a Linux desktop has not been recorded. You may [build the unmodified source for your own use](docs/DEVELOPMENT.md#linux-self-build); redistribution is prohibited.

![Visual and source editors with a fictional observatory project](docs/assets/editor-en.png)

## Working with documents

- Visual Markdown editing and source mode, tabs, and two panes.
- A project folder tree, project search, quick open, and document find/replace.
- Headings, lists, tasks, tables, code blocks, an outline, and a document map.
- Local image import and clipboard paste, relative document links, and navigation history.
- Templates for a blank document, a note, a game design document, and a video script.
- Autosave, recovery, and comparison of conflicting external changes.
- File creation, renaming, moving, and deletion through the system trash.
- Printing and PDF output through your system print dialog.
- Russian and English interfaces, adjustable text sizes, and a dark theme.

Open a folder or a Markdown file to start. Give a new draft a name and location with **Save** before autosave can write it to disk. You can switch between visual and source modes while working.

| Action         | Windows / Linux     | macOS       |
| -------------- | ------------------- | ----------- |
| Save           | `Ctrl+S`            | `⌘S`        |
| Quick open     | `Ctrl+P`            | `⌘P`        |
| Find / replace | `Ctrl+F` / `Ctrl+H` | `⌘F` / `⌘H` |
| Print / PDF    | `Ctrl+Alt+P`        | `⌘⌥P`       |

## Privacy and limitations

Folden works without an account and has no telemetry or cloud sync. Documents, recovery copies, and logs stay local. Remote images load with your permission. Help and feedback buttons open GitHub in your browser. Diagnostic reports are exported only when you request them; review reports and screenshots before sharing them.

The visual editor supports common Markdown and keeps unsupported syntax in editable source blocks. Support for every Markdown dialect, identical fonts, and matching print layouts across systems is not guaranteed. Printing and PDF output depend on the system webview and printer configuration.

## Help and rights

[Report a problem](https://github.com/byrnane/folden/issues) with your OS, Folden version, and steps to reproduce it. **Settings → Appearance → About Folden** contains help, version information, and licenses. Read the [security policy](SECURITY.md) before reporting a vulnerability, and keep sensitive documents and vulnerability details out of public issues.

Official binaries are **free for personal and commercial use**. Your documents belong to you. The author's code is available for inspection, with limited permission to build the unmodified source on Linux for your own use. Other reuse of the author's materials and redistribution of Folden builds are prohibited by the [usage terms](LICENSE.md). Third-party components retain their [own rights](LICENSE.md#third-party-components). Full third-party notices accompany official packages and are available in About → Licenses.

Created by **byrnane**. See [Development](docs/DEVELOPMENT.md), [Architecture](docs/ARCHITECTURE.md), [Product behavior](docs/PRODUCT.md), and the [Release procedure](docs/RELEASE.md) for technical details.
