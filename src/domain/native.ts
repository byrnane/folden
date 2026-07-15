import type { FileFingerprint, TextFileFormat } from './document'

export type WorkspaceDescriptor = {
  id: string
  rootPath: string
  name: string
}

export type WorkspaceEntry = {
  name: string
  path: string
  kind: 'directory' | 'file'
  openableState: 'unknown' | 'present' | 'empty'
  children: WorkspaceEntry[]
}

export type WorkspaceSettings = {
  ignoredPaths: string[]
}

export type OpenedDocument = {
  id: string
  path: string
  content: string
  workspaceId: string | null
  relativePath: string | null
  fileFormat: TextFileFormat
  fingerprint: FileFingerprint | null
}

export type SaveDocumentResult = OpenedDocument

export type NativeFsEvent = {
  kind: 'create' | 'modify' | 'remove'
  path: string
}

export type SessionDocumentKind = 'saved' | 'scratch'
export type SessionPaneId = 'left' | 'right'

export type PersistedSessionDocument = {
  key: string
  kind: SessionDocumentKind
  name: string
  path: string | null
  workspaceRootPath: string | null
  relativePath: string | null
}

export type PersistedSessionPane = {
  id: SessionPaneId
  documentKeys: string[]
  activeDocumentKey: string | null
}

export type PersistedPaneMode = {
  paneId: SessionPaneId
  documentKey: string
  mode: 'visual' | 'source'
}

export type PersistedSessionState = {
  workspaceRootPath: string | null
  splitEnabled: boolean
  activePaneId: SessionPaneId
  panes: PersistedSessionPane[]
  documents: PersistedSessionDocument[]
  paneModes: PersistedPaneMode[]
}

export type RecoverySnapshot = {
  key: string
  kind: SessionDocumentKind
  name: string
  path: string | null
  workspaceRootPath: string | null
  relativePath: string | null
  content: string
  fileFormat: TextFileFormat
  fingerprint: FileFingerprint | null
  updatedAtMs: number
}

export type RecoveryLoadResult = {
  entries: RecoverySnapshot[]
  diagnostics: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

export function isFileFingerprint(value: unknown): value is FileFingerprint {
  return (
    isRecord(value) &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    typeof value.modifiedAtMs === 'number' &&
    Number.isFinite(value.modifiedAtMs)
  )
}

export function isTextFileFormat(value: unknown): value is TextFileFormat {
  return (
    isRecord(value) &&
    (value.lineEnding === 'lf' || value.lineEnding === 'crlf') &&
    typeof value.hasUtf8Bom === 'boolean'
  )
}

export function isWorkspaceDescriptor(value: unknown): value is WorkspaceDescriptor {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.rootPath === 'string' &&
    typeof value.name === 'string'
  )
}

export function isWorkspaceEntry(value: unknown): value is WorkspaceEntry {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    (value.kind === 'directory' || value.kind === 'file') &&
    (value.openableState === 'unknown' ||
      value.openableState === 'present' ||
      value.openableState === 'empty') &&
    Array.isArray(value.children) &&
    value.children.every(isWorkspaceEntry)
  )
}

export function isWorkspaceSettings(value: unknown): value is WorkspaceSettings {
  return (
    isRecord(value) &&
    Array.isArray(value.ignoredPaths) &&
    value.ignoredPaths.every((path) => typeof path === 'string')
  )
}

export function isOpenedDocument(value: unknown): value is OpenedDocument {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.path === 'string' &&
    typeof value.content === 'string' &&
    isStringOrNull(value.workspaceId) &&
    isStringOrNull(value.relativePath) &&
    isTextFileFormat(value.fileFormat) &&
    (value.fingerprint === null || isFileFingerprint(value.fingerprint))
  )
}

export function isNativeFsEvent(value: unknown): value is NativeFsEvent {
  return (
    isRecord(value) &&
    (value.kind === 'create' || value.kind === 'modify' || value.kind === 'remove') &&
    typeof value.path === 'string'
  )
}

function isSessionDocumentKind(value: unknown): value is SessionDocumentKind {
  return value === 'saved' || value === 'scratch'
}

function isSessionPaneId(value: unknown): value is SessionPaneId {
  return value === 'left' || value === 'right'
}

export function isPersistedSessionState(value: unknown): value is PersistedSessionState {
  return (
    isRecord(value) &&
    isStringOrNull(value.workspaceRootPath) &&
    typeof value.splitEnabled === 'boolean' &&
    isSessionPaneId(value.activePaneId) &&
    Array.isArray(value.panes) &&
    value.panes.every(
      (pane) =>
        isRecord(pane) &&
        isSessionPaneId(pane.id) &&
        Array.isArray(pane.documentKeys) &&
        pane.documentKeys.every((key) => typeof key === 'string') &&
        isStringOrNull(pane.activeDocumentKey),
    ) &&
    Array.isArray(value.documents) &&
    value.documents.every(
      (document) =>
        isRecord(document) &&
        typeof document.key === 'string' &&
        isSessionDocumentKind(document.kind) &&
        typeof document.name === 'string' &&
        isStringOrNull(document.path) &&
        isStringOrNull(document.workspaceRootPath) &&
        isStringOrNull(document.relativePath),
    ) &&
    Array.isArray(value.paneModes) &&
    value.paneModes.every(
      (paneMode) =>
        isRecord(paneMode) &&
        isSessionPaneId(paneMode.paneId) &&
        typeof paneMode.documentKey === 'string' &&
        (paneMode.mode === 'visual' || paneMode.mode === 'source'),
    )
  )
}

export function isRecoverySnapshot(value: unknown): value is RecoverySnapshot {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    isSessionDocumentKind(value.kind) &&
    typeof value.name === 'string' &&
    isStringOrNull(value.path) &&
    isStringOrNull(value.workspaceRootPath) &&
    isStringOrNull(value.relativePath) &&
    typeof value.content === 'string' &&
    isTextFileFormat(value.fileFormat) &&
    (value.fingerprint === null || isFileFingerprint(value.fingerprint)) &&
    typeof value.updatedAtMs === 'number' &&
    Number.isFinite(value.updatedAtMs)
  )
}
