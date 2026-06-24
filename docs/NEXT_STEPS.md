# Folden Next Steps

## Current Next Steps

1. Run the desktop app with:

```powershell
npm run app:dev
```

2. Smoke-test the native file flow manually:
   * create a new document;
   * type text;
   * save it to disk;
   * open the same file again;
   * edit and save over the existing path.

3. Decide whether to rename the Tauri identifier from `com.folden.app` to something like `com.folden.editor`. Tauri warns that identifiers ending in `.app` can conflict with the macOS app bundle extension.

4. Decide whether the current simple unsaved-changes confirmation is enough for 0.1, or whether closing/opening should get a dedicated modal later.

5. Later cleanup:
   * reduce the CodeMirror bundle chunk if it becomes a real startup problem;
   * add a custom app icon;
   * add a proper title bar only after the basic file flow feels right.
