import { describe, expect, it } from 'vitest'
import type { WorkspaceEntry } from '../../../../src/domain/native'
import {
  filterWorkspaceEntries,
  filterWorkspaceEntriesByIgnoredNames,
} from '../../../../src/domain/workspace/workspaceFilters'

function entry(value: Omit<WorkspaceEntry, 'hasOpenableDescendants'>): WorkspaceEntry {
  return {
    ...value,
    hasOpenableDescendants:
      value.kind === 'directory'
        ? value.children.some((child) => child.kind === 'file' || child.hasOpenableDescendants)
        : false,
  }
}

describe('workspace entry filters', () => {
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
        hasOpenableDescendants: false,
        children: [],
      },
    ])
  })
})
