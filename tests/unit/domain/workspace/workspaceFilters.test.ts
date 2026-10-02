import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceEntry } from '../../../../src/domain/native'
import {
  filterWorkspaceEntries,
  filterWorkspaceEntriesByIgnoredNames,
} from '../../../../src/domain/workspace/workspaceFilters'

function entry(value: Omit<WorkspaceEntry, 'openableState'>): WorkspaceEntry {
  return {
    ...value,
    openableState:
      value.kind === 'directory'
        ? value.children.some((child) => child.kind === 'file' || child.openableState === 'present')
          ? 'present'
          : 'empty'
        : 'present',
  }
}

describe('workspace entry filters', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps case-distinct Unix paths and reads legacy separators', () => {
    vi.stubGlobal('navigator', { platform: 'Linux' })
    const entries = [
      entry({ name: 'Draft.md', path: 'notes/Draft.md', kind: 'file', children: [] }),
      entry({ name: 'draft.md', path: 'notes/draft.md', kind: 'file', children: [] }),
    ]
    expect(filterWorkspaceEntries(entries, [], ['notes\\draft.md'])).toEqual([entries[0]])
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(filterWorkspaceEntries(entries, [], ['notes\\draft.md'])).toEqual([])
  })
  it('removes ignored entries recursively without touching other files', () => {
    expect(
      filterWorkspaceEntriesByIgnoredNames(
        [
          entry({
            name: '.git',
            path: '.git',
            kind: 'directory',
            children: [],
          }),
          entry({
            name: 'notes',
            path: 'notes',
            kind: 'directory',
            children: [
              entry({
                name: '.cache',
                path: 'notes\\.cache',
                kind: 'directory',
                children: [],
              }),
              entry({
                name: 'daily.md',
                path: 'notes\\daily.md',
                kind: 'file',
                children: [],
              }),
            ],
          }),
          entry({
            name: 'README.md',
            path: 'README.md',
            kind: 'file',
            children: [],
          }),
        ],
        ['.git', '.cache'],
      ),
    ).toEqual([
      entry({
        name: 'notes',
        path: 'notes',
        kind: 'directory',
        children: [
          entry({
            name: 'daily.md',
            path: 'notes\\daily.md',
            kind: 'file',
            children: [],
          }),
        ],
      }),
      entry({
        name: 'README.md',
        path: 'README.md',
        kind: 'file',
        children: [],
      }),
    ])
  })

  it('removes ignored workspace paths recursively', () => {
    expect(
      filterWorkspaceEntries(
        [
          entry({
            name: 'notes',
            path: 'notes',
            kind: 'directory',
            children: [
              entry({
                name: 'daily.md',
                path: 'notes\\daily.md',
                kind: 'file',
                children: [],
              }),
            ],
          }),
          entry({
            name: 'README.md',
            path: 'README.md',
            kind: 'file',
            children: [],
          }),
        ],
        [],
        ['notes'],
      ),
    ).toEqual([
      entry({
        name: 'README.md',
        path: 'README.md',
        kind: 'file',
        children: [],
      }),
    ])
  })

  it('recomputes directory openable state after filtering ignored paths', () => {
    expect(
      filterWorkspaceEntries(
        [
          entry({
            name: 'notes',
            path: 'notes',
            kind: 'directory',
            children: [
              entry({
                name: 'daily.md',
                path: 'notes\\daily.md',
                kind: 'file',
                children: [],
              }),
            ],
          }),
        ],
        [],
        ['notes\\daily.md'],
      ),
    ).toEqual([
      {
        name: 'notes',
        path: 'notes',
        kind: 'directory',
        openableState: 'empty',
        children: [],
      },
    ])
  })
})
