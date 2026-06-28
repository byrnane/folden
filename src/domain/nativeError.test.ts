import { describe, expect, it } from 'vitest'
import { createNativeError, isNativeError } from './nativeError'

describe('native error domain', () => {
  it('keeps the typed native error shape stable', () => {
    const error = createNativeError({
      code: 'invalid_name',
      operation: 'create_file',
      userMessage: 'Name is invalid.',
      technicalMessage: null,
      retryable: false,
    })

    expect(isNativeError(error)).toBe(true)
    expect(error).toEqual({
      code: 'invalid_name',
      operation: 'create_file',
      userMessage: 'Name is invalid.',
      technicalMessage: null,
      retryable: false,
    })
  })

  it('rejects unknown shapes', () => {
    expect(
      isNativeError({
        code: 'bad_code',
        operation: 'save',
        userMessage: 'Broken',
        technicalMessage: null,
        retryable: true,
      }),
    ).toBe(false)
  })
})
