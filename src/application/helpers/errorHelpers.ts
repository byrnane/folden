export function formatError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'userMessage' in error &&
    typeof (error as { userMessage?: unknown }).userMessage === 'string'
  ) {
    return (error as { userMessage: string }).userMessage
  }

  return error instanceof Error ? error.message : String(error)
}
