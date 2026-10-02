import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanDisplayPath,
  fileNameFromPath,
  isMarkdownDocument,
  isMarkdownPath,
  joinWorkspacePath,
  normalizePath,
  parentPath,
  readMarkdownTitle,
  recoveredCopyName,
  safeFileBaseName,
  suggestFileName,
  workspaceNameFromPath,
} from '../../../../src/application/helpers/pathHelpers'

describe('path helpers', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('normalizes Windows display paths and file names', () => {
    expect(cleanDisplayPath('\\\\?\\C:\\Notes\\draft.md')).toBe('C:\\Notes\\draft.md')
    expect(cleanDisplayPath('\\\\?\\UNC\\server\\share\\draft.md')).toBe(
      '\\\\server\\share\\draft.md',
    )
    expect(fileNameFromPath('\\\\?\\C:\\Notes\\draft.md')).toBe('draft.md')
    expect(workspaceNameFromPath('C:\\Projects\\Folden')).toBe('Folden')
  })

  it('builds normalized workspace paths without duplicating separators', () => {
    expect(parentPath('C:\\Notes\\daily\\draft.md')).toBe('C:\\Notes\\daily')
    expect(parentPath('draft.md')).toBeNull()
    expect(joinWorkspacePath('C:\\Notes\\', '\\daily\\draft.md')).toBe('C:\\Notes\\daily\\draft.md')
    expect(joinWorkspacePath('C:\\Notes', null)).toBe('C:\\Notes')
    expect(normalizePath('C:/Notes/Daily.md')).toBe('c:/notes/daily.md')
  })

  it('preserves POSIX roots and case while accepting legacy relative separators', () => {
    vi.stubGlobal('navigator', { platform: 'Linux' })
    expect(joinWorkspacePath('/home/Max/Notes/', 'daily\\Draft.md')).toBe(
      '/home/Max/Notes/daily/Draft.md',
    )
    expect(joinWorkspacePath('/', 'Draft.md')).toBe('/Draft.md')
    expect(normalizePath('/Users/Max/Notes/Draft.md')).toBe('/Users/Max/Notes/Draft.md')
    expect(normalizePath('notes\\Draft.md')).toBe('notes/Draft.md')
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(normalizePath('notes/Draft.md')).toBe('notes/draft.md')
    expect(normalizePath('/home/Max/Draft.md')).toBe('/home/Max/Draft.md')
  })

  it('classifies markdown documents from path or fallback name', () => {
    expect(isMarkdownPath(null)).toBe(true)
    expect(isMarkdownPath('README.markdown')).toBe(true)
    expect(isMarkdownPath('notes.txt')).toBe(false)
    expect(isMarkdownDocument({ path: null, name: 'scratch.md' })).toBe(true)
    expect(isMarkdownDocument({ path: 'C:\\Notes\\plain.txt', name: 'scratch.md' })).toBe(false)
  })

  it('suggests safe recovered and new markdown file names from content', () => {
    expect(recoveredCopyName('draft.md')).toBe('draft (Recovered).md')
    expect(recoveredCopyName('README')).toBe('README (Recovered)')
    expect(readMarkdownTitle('intro\n# Real Title')).toBe('Real Title')
    expect(safeFileBaseName('  1. **Bad:/Name.**  ')).toBe('BadName')
    expect(suggestFileName('# Daily plan: ship?')).toBe('Daily plan ship.md')
    expect(suggestFileName('   \n')).toBe('Untitled.md')
  })
})
