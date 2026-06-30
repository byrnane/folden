import { describe, expect, it } from 'vitest'
import { filterWorkspaceEntriesByIgnoredNames } from '../../../../src/domain/workspace/workspaceFilters'

describe('workspace entry filters', () => {
  it('removes ignored entries recursively without touching other files', () => {
    expect(filterWorkspaceEntriesByIgnoredNames([
      {
        name: '.git',
        path: '.git',
        kind: 'directory',
        children: [],
      },
      {
        name: 'notes',
        path: 'notes',
        kind: 'directory',
        children: [
          {
            name: '.cache',
            path: 'notes\\.cache',
            kind: 'directory',
            children: [],
          },
          {
            name: 'daily.md',
            path: 'notes\\daily.md',
            kind: 'file',
            children: [],
          },
        ],
      },
      {
        name: 'README.md',
        path: 'README.md',
        kind: 'file',
        children: [],
      },
    ], ['.git', '.cache'])).toEqual([
      {
        name: 'notes',
        path: 'notes',
        kind: 'directory',
        children: [
          {
            name: 'daily.md',
            path: 'notes\\daily.md',
            kind: 'file',
            children: [],
          },
        ],
      },
      {
        name: 'README.md',
        path: 'README.md',
        kind: 'file',
        children: [],
      },
    ])
  })
})
