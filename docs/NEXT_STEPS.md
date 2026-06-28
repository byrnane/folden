# Folden Next Steps

## Manual Smoke Test

Run the desktop app:

```powershell
npm run app:dev
```

Check the 0.2 flow:

* open a workspace folder;
* create, rename, and move a file/folder to trash;
* open several Markdown files;
* edit Markdown in visual mode;
* switch one file to source mode and back;
* save changes;
* move one tab to the right split pane.

## Likely Next Work

* add autosave and recovery before relying on Folden for long sessions;
* add external file-change detection;
* add search inside the current document;
* replace prompt/confirm flows with proper dialogs;
* reduce the Tiptap bundle chunk if startup time becomes noticeable;
* migrate from deprecated `lucide-vue-next` to the current Lucide Vue package.
