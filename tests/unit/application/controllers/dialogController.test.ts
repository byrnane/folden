import { describe, expect, it } from 'vitest'
import { createDialogController } from '../../../../src/application/controllers/dialogController'

describe('dialog controller', () => {
  it('keeps prompt open on validation errors and resolves normalized values', async () => {
    const dialogs = createDialogController()
    const result = dialogs.openPromptDialog({
      title: 'Rename',
      message: 'New name',
      initialValue: 'draft.md',
      placeholder: 'Name',
      confirmLabel: 'Rename',
      inputLabel: 'Name',
      validate: (value) => value.trim() ? null : 'Name required',
      normalize: (value) => value.trim(),
    })

    dialogs.submitPromptDialog('   ')

    expect(dialogs.promptDialog.value).not.toBeNull()
    expect(dialogs.promptDialogError.value).toBe('Name required')

    dialogs.submitPromptDialog('  final.md  ')

    await expect(result).resolves.toBe('final.md')
    expect(dialogs.promptDialog.value).toBeNull()
    expect(dialogs.promptDialogError.value).toBeNull()
  })

  it('resolves prompt cancellation even when no dialog was active before it', async () => {
    const dialogs = createDialogController()

    dialogs.cancelPromptDialog()

    const result = dialogs.openPromptDialog({
      title: 'Create',
      message: 'File name',
      initialValue: '',
      placeholder: 'Name',
      confirmLabel: 'Create',
      inputLabel: 'Name',
    })

    dialogs.cancelPromptDialog()

    await expect(result).resolves.toBeNull()
    expect(dialogs.promptDialog.value).toBeNull()
    expect(dialogs.promptDialogError.value).toBeNull()
  })

  it('resolves every decision dialog and clears active state', async () => {
    const dialogs = createDialogController()
    const confirm = dialogs.openConfirmDialog({
      title: 'Delete',
      message: 'Delete file?',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      confirmTone: 'danger',
    })
    dialogs.resolveConfirmDialog(true)
    await expect(confirm).resolves.toBe(true)
    expect(dialogs.confirmDialog.value).toBeNull()

    const markdownSafety = dialogs.openMarkdownSafetyDialog({
      title: 'Unsafe markdown',
      features: [{ kind: 'html', line: 1, description: 'HTML block' }],
    })
    dialogs.resolveMarkdownSafetyDialog(false)
    await expect(markdownSafety).resolves.toBe(false)
    expect(dialogs.markdownSafetyDialog.value).toBeNull()

    const unsaved = dialogs.openUnsavedDialog({
      title: 'Unsaved',
      message: 'Save changes?',
      saveLabel: 'Save',
      discardLabel: 'Discard',
      cancelLabel: 'Cancel',
      showSave: true,
    })
    dialogs.resolveUnsavedDialog('discard')
    await expect(unsaved).resolves.toBe('discard')
    expect(dialogs.unsavedDialog.value).toBeNull()

    const recovery = dialogs.openRecoveryDialog({
      title: 'Recovery',
      message: 'Restore copy?',
      details: 'draft.md',
    })
    dialogs.resolveRecoveryDialog('open-copy')
    await expect(recovery).resolves.toBe('open-copy')
    expect(dialogs.recoveryDialog.value).toBeNull()

    const conflict = dialogs.openConflictDialog({
      title: 'Conflict',
      path: 'C:\\Notes\\draft.md',
      foldenContent: 'local',
      diskContent: 'disk',
    })
    dialogs.resolveConflictDialog({ kind: 'apply-merged', content: 'merged' })
    await expect(conflict).resolves.toEqual({ kind: 'apply-merged', content: 'merged' })
    expect(dialogs.conflictDialog.value).toBeNull()
  })
})
