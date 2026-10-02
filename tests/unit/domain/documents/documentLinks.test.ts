import { expect, it } from 'vitest'
import { resolveDocumentLink } from '../../../../src/domain/documents/documentLinks'
import { templateContent } from '../../../../src/domain/documents/templates'
it('resolves project links and rejects traversal outside the root', () => {
  expect(resolveDocumentLink('docs\\one.md', '../two%20words.md#Секция')).toEqual({
    path: 'two words.md',
    anchor: 'Секция',
  })
  expect(resolveDocumentLink('one.md', '#section')).toEqual({ path: 'one.md', anchor: 'section' })
  expect(() => resolveDocumentLink('one.md', '../two.md')).toThrow()
  expect(() => resolveDocumentLink('one.md', 'C:/two.md')).toThrow()
})
it('creates portable localized templates without sample content', () => {
  expect(templateContent('empty', 'Title', 'ru')).toBe('')
  expect(templateContent('game', 'Игра', 'ru')).toContain('## Игровой цикл')
  expect(templateContent('video', 'Video', 'en')).toContain('## Main part')
})

it('returns portable relative paths for nested and legacy document links', () => {
  expect(resolveDocumentLink('docs\\one.md', 'nested/two.md#heading')).toEqual({
    path: 'docs/nested/two.md',
    anchor: 'heading',
  })
  expect(resolveDocumentLink('docs\\one.md', '#heading')).toEqual({
    path: 'docs/one.md',
    anchor: 'heading',
  })
  expect(resolveDocumentLink('docs/one.md', '../two.md')).toEqual({ path: 'two.md', anchor: '' })
})
