import { afterEach, describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { language, russianMessages, t } from '../../../src/application/i18n'
import { formatError } from '../../../src/application/helpers/errorHelpers'
import { nativeErrorCodes } from '../../../src/domain/nativeError'

afterEach(() => {
  language.value = 'en'
})

describe('interface translations', () => {
  it('updates translated labels when the language changes', () => {
    const label = computed(() => t('Settings'))
    language.value = 'en'
    expect(label.value).toBe('Settings')
    language.value = 'ru'
    expect(label.value).toBe('Настройки')
  })

  it('inserts document names verbatim without interpreting their contents', () => {
    const name = 'Сценарий {count} $&.md'
    language.value = 'ru'
    expect(t('Close {name}?', { name })).toBe(`Закрыть ${name}?`)
    language.value = 'en'
    expect(t('Close {name}?', { name })).toBe(`Close ${name}?`)
    expect(t('Custom system failure {name}', { name })).toBe(`Custom system failure ${name}`)
    language.value = 'ru'
    expect(t('constructor')).toBe('constructor')
    expect(formatError({ code: 'constructor', userMessage: 'Unknown diagnostic' })).toBe(
      'Unknown diagnostic',
    )
  })

  it('keeps every translated message parameter and supplies a nonempty translation', () => {
    for (const [message, translated] of Object.entries(russianMessages)) {
      const placeholders = (value: string) =>
        [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
      expect(translated.trim(), message).not.toBe('')
      expect(placeholders(translated), message).toEqual(placeholders(message))
    }
  })

  it.each(nativeErrorCodes.filter((code) => code !== 'unknown'))(
    'translates native error %s while retaining its English detail',
    (code) => {
      const error = { code, userMessage: 'Native detail containing document.md' }
      language.value = 'en'
      expect(formatError(error)).toBe(error.userMessage)
      language.value = 'ru'
      expect(formatError(error)).toMatch(/[А-Яа-яЁё]/)
      expect(formatError(error)).not.toBe(error.userMessage)
    },
  )

  it('preserves unknown diagnostic details and translates known validation messages', () => {
    language.value = 'ru'
    expect(formatError(new Error('OS detail: document.md'))).toBe('OS detail: document.md')
    expect(formatError(new Error('Name is required.'))).toBe('Введите имя.')
    expect(formatError('Skipped recovery entry 2: invalid JSON')).toBe(
      'Пропущена запись восстановления 2: invalid JSON',
    )
    expect(formatError('Recovery data is malformed: invalid JSON')).toBe(
      'Данные восстановления повреждены: invalid JSON',
    )
  })
})
