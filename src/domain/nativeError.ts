export const nativeErrorCodes = [
  'not_found',
  'permission_denied',
  'outside_workspace',
  'invalid_name',
  'already_exists',
  'encoding_unsupported',
  'binary_file',
  'too_large',
  'unknown',
] as const

export type NativeErrorCode = (typeof nativeErrorCodes)[number]

export type NativeError = {
  code: NativeErrorCode
  operation: string
  userMessage: string
  technicalMessage: string | null
  retryable: boolean
}

export function createNativeError(error: NativeError): NativeError {
  return {
    ...error,
    technicalMessage: error.technicalMessage ?? null,
  }
}

export function isNativeError(value: unknown): value is NativeError {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.code === 'string' &&
    nativeErrorCodes.includes(candidate.code as NativeErrorCode) &&
    typeof candidate.operation === 'string' &&
    typeof candidate.userMessage === 'string' &&
    (typeof candidate.technicalMessage === 'string' || candidate.technicalMessage === null) &&
    typeof candidate.retryable === 'boolean'
  )
}
