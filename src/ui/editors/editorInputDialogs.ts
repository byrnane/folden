import { validateImageTarget, validateLinkTarget } from '../../domain/markdown/markdownSafety'

export type EditorInputDialogState = {
  title: string
  message: string
  initialValue: string
  placeholder: string
  confirmLabel: string
  inputLabel: string
  validate?: (value: string) => string | null
  normalize?: (value: string) => string
}

export function createLinkInputDialog(initialValue = ''): EditorInputDialogState {
  return {
    title: 'Edit link',
    message: 'Enter a URL for the selected link. Leave it empty to remove the link.',
    initialValue,
    placeholder: 'https://example.com',
    confirmLabel: 'Apply',
    inputLabel: 'Link URL',
    validate: (value) => validateLinkTarget(value),
    normalize: (value) => value.trim(),
  }
}

export function createImageInputDialog(initialValue = ''): EditorInputDialogState {
  return {
    title: 'Insert image',
    message:
      'Enter a relative, asset:, data:, http:, or https: image URL to insert into the document.',
    initialValue,
    placeholder: './image.png',
    confirmLabel: 'Insert',
    inputLabel: 'Image URL',
    validate: (value) => validateImageTarget(value),
    normalize: (value) => value.trim(),
  }
}
