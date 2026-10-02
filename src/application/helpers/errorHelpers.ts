import type { NativeErrorCode } from '../../domain/nativeError'
import { language, russianMessages, t, type MessageKey } from '../i18n'

const nativeErrorMessages = {
  not_found: 'File or folder not found.',
  permission_denied: 'Permission denied. Check access to the file or folder.',
  outside_workspace: 'This path is outside the project folder.',
  workspace_root_protected: 'The project root folder cannot be changed by this operation.',
  file_changed_externally: 'The file changed on disk. Resolve the conflict before saving.',
  invalid_name: 'This file or folder name is invalid.',
  already_exists: 'A file or folder with this name already exists.',
  encoding_unsupported: 'This text encoding is not supported. Use UTF-8.',
  binary_file: 'This is a binary file and cannot be opened as text.',
  too_large: 'The file is too large to open in Folden.',
} as const satisfies Record<Exclude<NativeErrorCode, 'unknown'>, MessageKey>

function translateSystemMessage(message: string) {
  const prefixes = [
    ['Filesystem watcher error: ', 'Filesystem watcher error: {error}'],
    ['Could not read recovery data: ', 'Could not read recovery data: {error}'],
    ['Recovery data is malformed: ', 'Recovery data is malformed: {error}'],
  ] as const
  for (const [prefix, key] of prefixes) {
    if (message.startsWith(prefix)) return t(key, { error: message.slice(prefix.length) })
  }
  const skippedEntry = message.match(/^Skipped recovery entry (\d+): (.+)$/s)
  if (skippedEntry) {
    return t('Skipped recovery entry {count}: {error}', {
      count: skippedEntry[1],
      error: skippedEntry[2],
    })
  }
  return t(message)
}

export function formatError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'userMessage' in error &&
    typeof (error as { userMessage?: unknown }).userMessage === 'string'
  ) {
    const userMessage = (error as { userMessage: string }).userMessage
    if (Object.prototype.hasOwnProperty.call(russianMessages, userMessage)) return t(userMessage)
    if (language.value === 'ru' && 'code' in error && typeof error.code === 'string') {
      const message = nativeErrorMessages[error.code as keyof typeof nativeErrorMessages]
      if (Object.prototype.hasOwnProperty.call(nativeErrorMessages, error.code)) return t(message)
    }
    return translateSystemMessage(userMessage)
  }

  return translateSystemMessage(error instanceof Error ? error.message : String(error))
}
