import { describe, expect, it } from 'vitest'
import contracts from '../../contracts/native/stable-contracts.json'
import {
  isFileFingerprint,
  isNativeFsEvent,
  isOpenedDocument,
  isPersistedSessionState,
  isRecoverySnapshot,
  isTextFileFormat,
  isWorkspaceDescriptor,
  isWorkspaceEntry,
  isWorkspaceSearchBatch,
  isWorkspaceSearchResult,
  isWorkspaceFilesResult,
} from '../../../src/domain/native'
import { isNativeError } from '../../../src/domain/nativeError'

describe('native contracts', () => {
  it('accepts the stable native wire fixtures', () => {
    expect(isNativeError(contracts.nativeError)).toBe(true)
    expect(isFileFingerprint(contracts.fileFingerprint)).toBe(true)
    expect(isTextFileFormat(contracts.textFileFormat)).toBe(true)
    expect(isWorkspaceDescriptor(contracts.workspaceDescriptor)).toBe(true)
    expect(isWorkspaceEntry(contracts.workspaceEntry)).toBe(true)
    expect(isOpenedDocument(contracts.openedDocument)).toBe(true)
    expect(isPersistedSessionState(contracts.persistedSessionState)).toBe(true)
    expect(isRecoverySnapshot(contracts.recoverySnapshot)).toBe(true)
    expect(isNativeFsEvent(contracts.nativeFsEvent)).toBe(true)
    expect(isWorkspaceSearchResult(contracts.workspaceSearchResult)).toBe(true)
    expect(isWorkspaceSearchBatch(contracts.workspaceSearchBatch)).toBe(true)
    expect(isWorkspaceFilesResult(contracts.workspaceFilesResult)).toBe(true)
  })

  it('rejects drifted native wire shapes', () => {
    expect(
      isOpenedDocument({
        ...contracts.openedDocument,
        fileFormat: {
          lineEnding: 'lf',
          hasUtf8Bom: 'yes',
        },
      }),
    ).toBe(false)
    expect(
      isPersistedSessionState({
        ...contracts.persistedSessionState,
        activePaneId: 'middle',
      }),
    ).toBe(false)
    expect(
      isNativeError({
        ...contracts.nativeError,
        code: 'brand_new_error',
      }),
    ).toBe(false)
    expect(isWorkspaceSearchResult({ ...contracts.workspaceSearchResult, skipped: -1 })).toBe(false)
    expect(
      isWorkspaceSearchBatch({
        ...contracts.workspaceSearchBatch,
        matches: [
          {
            ...contracts.workspaceSearchBatch.matches[0],
            from: -1,
          },
        ],
      }),
    ).toBe(false)
  })
})
