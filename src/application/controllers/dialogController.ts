import { ref } from 'vue'
import type { MarkdownUnsupportedFeature } from '../../domain/markdown/markdownSafety'

export type PromptDialogState = {
  title: string
  message: string
  initialValue: string
  placeholder: string
  confirmLabel: string
  inputLabel: string
  validate?: (value: string) => string | null
  normalize?: (value: string) => string
  resolve: (value: string | null) => void
}

export type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  confirmTone: 'default' | 'danger'
  resolve: (confirmed: boolean) => void
}

export type UnsavedDialogDecision = 'save' | 'discard' | 'cancel'

export type UnsavedDialogState = {
  title: string
  message: string
  saveLabel: string
  discardLabel: string
  cancelLabel: string
  showSave: boolean
  resolve: (decision: UnsavedDialogDecision) => void
}

export type RecoveryDialogDecision = 'restore' | 'open-copy' | 'discard' | 'later'

export type RecoveryDialogState = {
  title: string
  message: string
  details: string | null
  resolve: (decision: RecoveryDialogDecision) => void
}

export type MarkdownSafetyDialogState = {
  title: string
  features: MarkdownUnsupportedFeature[]
  resolve: (confirmed: boolean) => void
}

export type ConflictDialogDecision =
  | { kind: 'keep-folden' }
  | { kind: 'reload-disk' }
  | { kind: 'save-as' }
  | { kind: 'apply-merged'; content: string }
  | { kind: 'later' }

export type ConflictDialogState = {
  title: string
  path: string | null
  foldenContent: string
  diskContent: string
  resolve: (decision: ConflictDialogDecision) => void
}

export function createDialogController() {
  const promptDialog = ref<PromptDialogState | null>(null)
  const promptDialogError = ref<string | null>(null)
  const confirmDialog = ref<ConfirmDialogState | null>(null)
  const unsavedDialog = ref<UnsavedDialogState | null>(null)
  const markdownSafetyDialog = ref<MarkdownSafetyDialogState | null>(null)
  const conflictDialog = ref<ConflictDialogState | null>(null)
  const recoveryDialog = ref<RecoveryDialogState | null>(null)

  function openPromptDialog(options: Omit<PromptDialogState, 'resolve'>) {
    promptDialogError.value = null

    return new Promise<string | null>((resolve) => {
      promptDialog.value = {
        ...options,
        resolve,
      }
    })
  }

  function submitPromptDialog(value: string) {
    const currentDialog = promptDialog.value

    if (!currentDialog) {
      return
    }

    const validationError = currentDialog.validate?.(value) ?? null

    if (validationError) {
      promptDialogError.value = validationError
      return
    }

    promptDialogError.value = null
    promptDialog.value = null
    currentDialog.resolve(currentDialog.normalize ? currentDialog.normalize(value) : value)
  }

  function cancelPromptDialog() {
    const currentDialog = promptDialog.value
    promptDialogError.value = null
    promptDialog.value = null
    currentDialog?.resolve(null)
  }

  function openConfirmDialog(options: Omit<ConfirmDialogState, 'resolve'>) {
    return new Promise<boolean>((resolve) => {
      confirmDialog.value = {
        ...options,
        resolve,
      }
    })
  }

  function resolveConfirmDialog(confirmed: boolean) {
    const currentDialog = confirmDialog.value
    confirmDialog.value = null
    currentDialog?.resolve(confirmed)
  }

  function openMarkdownSafetyDialog(options: Omit<MarkdownSafetyDialogState, 'resolve'>) {
    return new Promise<boolean>((resolve) => {
      markdownSafetyDialog.value = {
        ...options,
        resolve,
      }
    })
  }

  function resolveMarkdownSafetyDialog(confirmed: boolean) {
    const currentDialog = markdownSafetyDialog.value
    markdownSafetyDialog.value = null
    currentDialog?.resolve(confirmed)
  }

  function openUnsavedDialog(options: Omit<UnsavedDialogState, 'resolve'>) {
    return new Promise<UnsavedDialogDecision>((resolve) => {
      unsavedDialog.value = {
        ...options,
        resolve,
      }
    })
  }

  function resolveUnsavedDialog(decision: UnsavedDialogDecision) {
    const currentDialog = unsavedDialog.value
    unsavedDialog.value = null
    currentDialog?.resolve(decision)
  }

  function openRecoveryDialog(options: Omit<RecoveryDialogState, 'resolve'>) {
    return new Promise<RecoveryDialogDecision>((resolve) => {
      recoveryDialog.value = {
        ...options,
        resolve,
      }
    })
  }

  function resolveRecoveryDialog(decision: RecoveryDialogDecision) {
    const currentDialog = recoveryDialog.value
    recoveryDialog.value = null
    currentDialog?.resolve(decision)
  }

  function openConflictDialog(options: Omit<ConflictDialogState, 'resolve'>) {
    return new Promise<ConflictDialogDecision>((resolve) => {
      conflictDialog.value = {
        ...options,
        resolve,
      }
    })
  }

  function resolveConflictDialog(decision: ConflictDialogDecision) {
    const currentDialog = conflictDialog.value
    conflictDialog.value = null
    currentDialog?.resolve(decision)
  }

  return {
    promptDialog,
    promptDialogError,
    confirmDialog,
    unsavedDialog,
    markdownSafetyDialog,
    conflictDialog,
    recoveryDialog,
    openPromptDialog,
    submitPromptDialog,
    cancelPromptDialog,
    openConfirmDialog,
    resolveConfirmDialog,
    openMarkdownSafetyDialog,
    resolveMarkdownSafetyDialog,
    openUnsavedDialog,
    resolveUnsavedDialog,
    openRecoveryDialog,
    resolveRecoveryDialog,
    openConflictDialog,
    resolveConflictDialog,
  }
}
