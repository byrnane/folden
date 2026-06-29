<script setup lang="ts">
import {
  Columns2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  PanelRightOpen,
  Save,
  X,
} from 'lucide-vue-next'
import ConfirmDialog from './components/ConfirmDialog.vue'
import MarkdownSafetyDialog from './components/MarkdownSafetyDialog.vue'
import PromptDialog from './components/PromptDialog.vue'
import RecoveryDialog from './components/RecoveryDialog.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import SourceEditor from './SourceEditor.vue'
import VisualMarkdownEditor from './VisualMarkdownEditor.vue'
import WorkspaceTree from './WorkspaceTree.vue'
import { useApplicationShell, type EditorAdapter } from './applicationShell'

const {
  activeDocument,
  activeLocation,
  activePaneId,
  activePath,
  appSettings,
  cleanDisplayPath,
  closeDocument,
  canExecuteCommand,
  clearDocumentExternalState,
  clearSidebarSelection,
  confirmDialog,
  createWorkspaceDirectory,
  createWorkspaceFile,
  dirtyDocuments,
  documents,
  errorMessage,
  executeCommand,
  expandedWorkspacePaths,
  getDocument,
  getDocumentMode,
  getViewSessionId,
  handleDocumentUpdate,
  isDirty,
  isFileBusy,
  isMarkdownPath,
  loadWorkspace,
  loadingWorkspacePaths,
  markdownSafetyDialog,
  openEntryInRight,
  openWorkspaceFile,
  promptDialog,
  promptDialogError,
  recentWorkspaces,
  recoveryDialog,
  reloadDocumentFromDisk,
  renameWorkspacePath,
  resolveConfirmDialog,
  resolveMarkdownSafetyDialog,
  resolveRecoveryDialog,
  resolveUnsavedDialog,
  restoreWorkspaceByPath,
  runFileTask,
  saveDocumentAsCopy,
  selectedPath,
  setActiveDocument,
  setActivePane,
  setPaneDocumentMode,
  setPaneEditorAdapter,
  splitEnabled,
  submitPromptDialog,
  cancelPromptDialog,
  toggleWorkspaceDirectory,
  trashWorkspacePath,
  unsavedDialog,
  visiblePanes,
  watcherWarning,
  workspace,
  workspaceLoadErrors,
  workspaceNameFromPath,
} = useApplicationShell()
</script>

<template>
  <main class="app-shell" data-testid="app-shell">
    <aside class="workspace-sidebar" aria-label="Workspace" @click.self="clearSidebarSelection">
      <div class="workspace-header">
        <div>
          <p class="app-kicker">Folden</p>
          <h1>{{ workspace?.name ?? 'No workspace' }}</h1>
        </div>
        <button
          type="button"
          class="icon-button"
          title="Open folder"
          :disabled="!canExecuteCommand('workspace.open')"
          @click="executeCommand('workspace.open')"
        >
          <FolderOpen :size="17" />
        </button>
      </div>

      <div class="workspace-actions">
        <button
          type="button"
          class="icon-button"
          title="New scratch document"
          :disabled="!canExecuteCommand('document.new')"
          @click="executeCommand('document.new')"
        >
          <FilePlus :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="New file"
          :disabled="!canExecuteCommand('workspace.createFile')"
          @click="executeCommand('workspace.createFile')"
        >
          <FilePlus :size="16" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="New folder"
          :disabled="!canExecuteCommand('workspace.createDirectory')"
          @click="executeCommand('workspace.createDirectory')"
        >
          <FolderPlus :size="16" />
        </button>
      </div>

      <div v-if="workspace" class="workspace-root" :title="workspace.rootPath" data-testid="workspace-root">
        {{ workspace.rootPath }}
      </div>

      <div
        v-if="workspace"
        class="workspace-tree-shell"
        @click.self="clearSidebarSelection"
      >
        <WorkspaceTree
          :entries="workspace.entries"
          :active-path="activePath"
          :selected-path="selectedPath"
          :expanded-paths="expandedWorkspacePaths"
          :loading-paths="loadingWorkspacePaths"
          :load-errors="workspaceLoadErrors"
          @clear-selection="clearSidebarSelection"
          @open-file="openWorkspaceFile"
          @select-path="selectedPath = $event.path"
          @create-file="createWorkspaceFile($event.path)"
          @create-directory="createWorkspaceDirectory($event.path)"
          @rename-path="renameWorkspacePath"
          @trash-path="trashWorkspacePath"
          @toggle-directory="toggleWorkspaceDirectory"
        />
      </div>

      <section v-else class="empty-sidebar">
        <p>Open a folder to start a workspace.</p>
        <button
          type="button"
          :disabled="!canExecuteCommand('workspace.open')"
          data-testid="open-folder-empty"
          @click="executeCommand('workspace.open')"
        >
          Open Folder
        </button>

        <div v-if="recentWorkspaces.length" class="recent-workspaces">
          <p class="sidebar-label">Recent</p>
          <button
            v-for="path in recentWorkspaces"
            :key="path"
            type="button"
            class="recent-workspace"
            :title="path"
            @click="
              runFileTask(
                async () => loadWorkspace(await restoreWorkspaceByPath(path)),
                'Could not open recent workspace',
              )
            "
          >
            {{ workspaceNameFromPath(path) }}
          </button>
        </div>
      </section>
    </aside>

    <section class="workbench">
      <header class="topbar">
        <div class="topbar-title">
          <span class="document-title" data-testid="document-title">{{ activeDocument?.name ?? 'No document' }}</span>
          <span v-if="dirtyDocuments.length" class="dirty-marker" data-testid="dirty-marker">
            {{ dirtyDocuments.length }} unsaved
          </span>
        </div>

        <div class="topbar-actions">
          <label class="autosave-toggle" title="Automatically save changed existing files after a short pause">
            <input
              v-model="appSettings.autosave.enabled"
              type="checkbox"
            >
            <span>Autosave</span>
          </label>
          <button
            type="button"
            title="Open file"
            :disabled="!canExecuteCommand('document.open')"
            @click="executeCommand('document.open')"
          >
            Open
          </button>
          <button
            type="button"
            title="Open logs folder"
            :disabled="!canExecuteCommand('logs.open')"
            @click="executeCommand('logs.open')"
          >
            Logs
          </button>
          <button
            type="button"
            class="icon-button"
            title="Save"
            data-testid="save-document"
            :disabled="!canExecuteCommand('document.save')"
            @click="executeCommand('document.save')"
          >
            <Save :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Toggle split view"
            :class="{ active: splitEnabled }"
            :disabled="!canExecuteCommand('layout.toggleSplit')"
            @click="executeCommand('layout.toggleSplit')"
          >
            <Columns2 :size="16" />
          </button>
          <button
            type="button"
            class="icon-button"
            title="Move active tab right"
            :disabled="!canExecuteCommand('layout.moveViewRight')"
            @click="executeCommand('layout.moveViewRight')"
          >
            <PanelRightOpen :size="16" />
          </button>
        </div>
      </header>

      <p
        v-if="errorMessage || watcherWarning"
        :class="errorMessage ? 'error-message' : 'warning-message'"
      >
        {{ errorMessage ?? watcherWarning }}
      </p>
      <section
        v-if="activeDocument?.externalState === 'conflict'"
        class="document-warning"
      >
        <div>
          <strong>External changes detected.</strong>
          <span>{{ activeDocument.externalMessage }}</span>
        </div>
        <div class="document-warning-actions">
          <button type="button" @click="reloadDocumentFromDisk(activeDocument.id)">
            Reload from disk
          </button>
          <button type="button" @click="saveDocumentAsCopy(activeDocument)">
            Save As
          </button>
          <button type="button" @click="clearDocumentExternalState(activeDocument.id)">
            Later
          </button>
        </div>
      </section>
      <section
        v-else-if="activeDocument?.externalState === 'missing'"
        class="document-warning"
      >
        <div>
          <strong>File is missing on disk.</strong>
          <span>{{ activeDocument.externalMessage }}</span>
        </div>
        <div class="document-warning-actions">
          <button type="button" @click="saveDocumentAsCopy(activeDocument)">
            Save As
          </button>
          <button type="button" @click="reloadDocumentFromDisk(activeDocument.id)">
            Retry reload
          </button>
        </div>
      </section>

      <section class="pane-grid" :class="{ split: splitEnabled }">
        <section
          v-for="pane in visiblePanes"
          :key="pane.id"
          class="editor-pane"
          :class="{ active: activePaneId === pane.id }"
          @click="setActivePane(pane.id)"
        >
          <header class="pane-header">
            <span>{{ pane.title }}</span>
            <div class="pane-tabs">
              <button
                v-for="documentId in pane.documentIds"
                :key="documentId"
                type="button"
                class="tab-button"
                :class="{ active: pane.activeDocumentId === documentId }"
                @click.stop="setActiveDocument(pane, documentId)"
              >
                <span>{{ getDocument(documentId)?.name ?? 'Missing' }}</span>
                <span v-if="getDocument(documentId) && isDirty(getDocument(documentId)!)" class="tab-dot" />
                <X
                  class="tab-close"
                  :size="13"
                  @click.stop="closeDocument(pane, documentId)"
                />
              </button>
            </div>
          </header>

          <template v-if="pane.activeDocumentId && getDocument(pane.activeDocumentId)">
            <div class="mode-switch">
              <button
                type="button"
                :class="{ active: getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual' }"
                :disabled="!isMarkdownPath(getDocument(pane.activeDocumentId)?.path ?? null)"
                @click="setPaneDocumentMode(pane, getDocument(pane.activeDocumentId)!, 'visual')"
              >
                Visual
              </button>
              <button
                type="button"
                :class="{ active: getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'source' }"
                @click="setPaneDocumentMode(pane, getDocument(pane.activeDocumentId)!, 'source')"
              >
                Source
              </button>
              <button
                v-if="pane.id !== 'right' && workspace && getDocument(pane.activeDocumentId)?.relativePath"
                type="button"
                class="open-right-button"
                @click="
                  openEntryInRight({
                    name: getDocument(pane.activeDocumentId)!.name,
                    path: getDocument(pane.activeDocumentId)!.relativePath!,
                    kind: 'file',
                    children: [],
                  })
                "
              >
                Open Right
              </button>
            </div>

            <VisualMarkdownEditor
              v-if="getDocumentMode(pane, getDocument(pane.activeDocumentId)!) === 'visual'"
              :key="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
              :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
              :document-id="getDocument(pane.activeDocumentId)!.id"
              :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
              :model-value="getDocument(pane.activeDocumentId)!.content"
              :revision="getDocument(pane.activeDocumentId)!.revision"
              @document-update="handleDocumentUpdate"
            />
            <section v-else class="source-editor-frame">
              <SourceEditor
                :key="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
                :ref="(value) => setPaneEditorAdapter(pane.id, value as EditorAdapter | null)"
                :document-id="getDocument(pane.activeDocumentId)!.id"
                :view-id="getViewSessionId(pane, getDocument(pane.activeDocumentId)!)"
                :model-value="getDocument(pane.activeDocumentId)!.content"
                :revision="getDocument(pane.activeDocumentId)!.revision"
                @document-update="handleDocumentUpdate"
              />
            </section>
          </template>

          <div v-else class="empty-pane">
            <p>No open file in this pane.</p>
          </div>
        </section>
      </section>

      <footer class="statusbar">
        <span>{{ documents.length }} open</span>
        <span
          class="path-status"
          :title="activeDocument?.path ? cleanDisplayPath(activeDocument.path) : 'Scratch document'"
          data-testid="status-path"
        >
          {{ activeLocation }}
        </span>
        <span>{{ activeDocument ? `${activeDocument.content.length} chars` : 'No document' }}</span>
      </footer>
    </section>
  </main>

  <PromptDialog
    :open="!!promptDialog"
    :title="promptDialog?.title ?? ''"
    :message="promptDialog?.message ?? ''"
    :initial-value="promptDialog?.initialValue ?? ''"
    :placeholder="promptDialog?.placeholder ?? ''"
    :confirm-label="promptDialog?.confirmLabel ?? 'Save'"
    :input-label="promptDialog?.inputLabel ?? 'Value'"
    :error="promptDialogError"
    @submit="submitPromptDialog"
    @cancel="cancelPromptDialog"
  />

  <ConfirmDialog
    :open="!!confirmDialog"
    :title="confirmDialog?.title ?? ''"
    :message="confirmDialog?.message ?? ''"
    :confirm-label="confirmDialog?.confirmLabel ?? 'Confirm'"
    :cancel-label="confirmDialog?.cancelLabel ?? 'Cancel'"
    :confirm-tone="confirmDialog?.confirmTone ?? 'default'"
    @confirm="resolveConfirmDialog(true)"
    @cancel="resolveConfirmDialog(false)"
  />

  <MarkdownSafetyDialog
    :open="!!markdownSafetyDialog"
    :title="markdownSafetyDialog?.title ?? ''"
    :features="markdownSafetyDialog?.features ?? []"
    @confirm="resolveMarkdownSafetyDialog(true)"
    @cancel="resolveMarkdownSafetyDialog(false)"
  />

  <UnsavedChangesDialog
    :open="!!unsavedDialog"
    :title="unsavedDialog?.title ?? ''"
    :message="unsavedDialog?.message ?? ''"
    :save-label="unsavedDialog?.saveLabel ?? 'Save'"
    :discard-label="unsavedDialog?.discardLabel ?? 'Discard'"
    :cancel-label="unsavedDialog?.cancelLabel ?? 'Cancel'"
    :show-save="unsavedDialog?.showSave ?? true"
    @save="resolveUnsavedDialog('save')"
    @discard="resolveUnsavedDialog('discard')"
    @cancel="resolveUnsavedDialog('cancel')"
  />

  <RecoveryDialog
    :open="!!recoveryDialog"
    :title="recoveryDialog?.title ?? ''"
    :message="recoveryDialog?.message ?? ''"
    :details="recoveryDialog?.details ?? null"
    @restore="resolveRecoveryDialog('restore')"
    @open-copy="resolveRecoveryDialog('open-copy')"
    @discard="resolveRecoveryDialog('discard')"
    @later="resolveRecoveryDialog('later')"
  />
</template>
