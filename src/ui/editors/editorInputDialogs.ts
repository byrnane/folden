import { t } from '../../application/i18n'
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
    title: t('Edit link'),
    message: t('Enter a URL for the selected link. Leave it empty to remove the link.'),
    initialValue,
    placeholder: 'https://example.com',
    confirmLabel: t('Apply'),
    inputLabel: t('Link URL'),
    validate: (value) => {
      const error = validateLinkTarget(value)
      return error ? t(error) : null
    },
    normalize: (value) => value.trim(),
  }
}

export function createImageInputDialog(initialValue = ''): EditorInputDialogState {
  return {
    title: t('Insert image'),
    message: t(
      'Enter a relative, asset:, data:, http:, or https: image URL to insert into the document.',
    ),
    initialValue,
    placeholder: './image.png',
    confirmLabel: t('Insert'),
    inputLabel: t('Image URL'),
    validate: (value) => {
      const error = validateImageTarget(value)
      return error ? t(error) : null
    },
    normalize: (value) => value.trim(),
  }
}
