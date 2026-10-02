import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { findPrivacyIssues, sourcePrivacyIssues } from './privacy-check.mjs'
import {
  selectPackages,
  checksumLines,
  checkWindowsArchitecture,
  stagedPackageNames,
  additionalReleaseFiles,
  checkInstallerNativePayload,
} from './release-verify.mjs'
import { classifyCargoGraph, releaseTargets } from './release-dependencies.mjs'
import { checkNativeAttribution } from './release-native-audit.mjs'

assert.deepEqual(findPrivacyIssues('Public Markdown and https://example.com'), [])
assert(findPrivacyIssues('ghp_' + 'A'.repeat(30)).includes('access token'))
assert.deepEqual(findPrivacyIssues('publicKeyToken="' + '0'.repeat(16) + '"'), [])
for (const key of ['token', 'password', 'api_key', 'github_token', 'clientSecret'])
  assert(findPrivacyIssues(key + '="' + 'A'.repeat(16) + '"').includes('secret assignment'))
assert(
  findPrivacyIssues('C:\\Users\\' + 'test_user\\.cargo\\source.rs').includes('private user path'),
)
assert(findPrivacyIssues('personal contact', ['personal contact']).includes('private Git identity'))
const fixturePath = '/home/' + 'Max/Draft.md'
assert.deepEqual(
  sourcePrivacyIssues(`'${fixturePath}'`, 'tests/unit/application/sessionRecovery.test.ts'),
  [],
)
assert(
  sourcePrivacyIssues(
    "'/home/" + "Max/Notes/Unknown.md'",
    'tests/unit/application/helpers/pathHelpers.test.ts',
  ).includes('private user path'),
)
assert(
  sourcePrivacyIssues(fixturePath, 'src/application/sessionRecovery.ts').includes(
    'private user path',
  ),
)
assert(
  sourcePrivacyIssues(
    '/home/' + 'Another/private.md',
    'tests/unit/application/sessionRecovery.test.ts',
  ).includes('private user path'),
)
assert(
  sourcePrivacyIssues(
    'ghp_' + 'A'.repeat(30),
    'tests/unit/application/sessionRecovery.test.ts',
  ).includes('access token'),
)
assert.deepEqual(
  selectPackages(['Folden_0.12.0_x64-setup.exe'], '0.12.0', 'x86_64-pc-windows-msvc'),
  ['Folden_0.12.0_x64-setup.exe'],
)
assert.throws(() =>
  selectPackages(['Folden_0.11.0_x64-setup.exe'], '0.12.0', 'x86_64-pc-windows-msvc'),
)
assert.throws(() =>
  selectPackages(['Folden_0.12.00_x64-setup.exe'], '0.12.0', 'x86_64-pc-windows-msvc'),
)
assert.throws(() =>
  selectPackages(['Folden Beta Smoke_0.12.0_x64-setup.exe'], '0.12.0', 'x86_64-pc-windows-msvc'),
)
assert.throws(() =>
  selectPackages(['one_0.12.0.exe', 'two_0.12.0.exe'], '0.12.0', 'x86_64-pc-windows-msvc'),
)
assert.throws(() =>
  selectPackages(['Folden_0.12.0.AppImage'], '0.12.0', 'x86_64-unknown-linux-gnu'),
)
assert.deepEqual(stagedPackageNames('0.12.0', 'x86_64-pc-windows-msvc'), [
  'Folden_0.12.0_windows-x64-setup.exe',
])
assert.deepEqual(additionalReleaseFiles('x86_64-pc-windows-msvc'), ['nsis-3.11-src.tar.bz2'])
assert.throws(() => checkInstallerNativePayload('unknown.dll', Buffer.from('changed')))
assert.throws(() => checkInstallerNativePayload('System.dll', Buffer.from('changed')))
assert.throws(
  () =>
    checkNativeAttribution({
      unknownComponents: [],
      remainingReview: 'non-ELF attribution pending',
    }),
  /whole-payload attribution is unfinished/,
)
assert.doesNotThrow(() => checkNativeAttribution({ unknownComponents: [], remainingReview: '' }))
assert.throws(
  () =>
    checkNativeAttribution({ unknownComponents: [{ path: 'unreviewed.so' }], remainingReview: '' }),
  /license\/source provenance is unresolved/,
)
assert.deepEqual(stagedPackageNames('0.12.0', 'x86_64-unknown-linux-gnu'), [
  'Folden_0.12.0_linux-x64.AppImage',
  'Folden_0.12.0_linux-x64.deb',
])
const graph = classifyCargoGraph({
  packages: [
    { id: 'app', targets: [{ kind: ['bin'] }] },
    { id: 'library', targets: [{ kind: ['lib'] }] },
    { id: 'macro', targets: [{ kind: ['proc-macro'] }] },
    { id: 'builder', targets: [{ kind: ['lib'] }] },
  ],
  resolve: {
    root: 'app',
    nodes: [
      {
        id: 'app',
        deps: [
          { pkg: 'library', dep_kinds: [{ kind: null }] },
          { pkg: 'macro', dep_kinds: [{ kind: null }] },
          { pkg: 'builder', dep_kinds: [{ kind: 'build' }] },
        ],
      },
      { id: 'library', deps: [] },
      { id: 'macro', deps: [] },
      { id: 'builder', deps: [] },
    ],
  },
})
assert.deepEqual([...graph.get('library')], ['runtime'])
assert.deepEqual([...graph.get('macro')], ['build'])
assert.deepEqual([...graph.get('builder')], ['build'])
assert.deepEqual(
  Object.values(releaseTargets).sort(),
  Object.keys((await import('./release-verify.mjs')).releaseFormats).sort(),
)
const executable = Buffer.alloc(80)
executable.write('MZ')
executable.writeUInt32LE(64, 60)
executable.write('PE\0\0', 64)
executable.writeUInt16LE(0x8664, 68)
checkWindowsArchitecture(executable)
executable.writeUInt16LE(0x14c, 68)
assert.throws(() => checkWindowsArchitecture(executable))
mkdirSync('.cache', { recursive: true })
const directory = mkdtempSync(path.join('.cache', 'release-check-'))
assert.equal(path.dirname(path.resolve(directory)), path.resolve('.cache'))
try {
  const filename = path.join(directory, 'example.txt')
  writeFileSync(filename, 'abc')
  assert.equal(
    checksumLines([filename]),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  example.txt\n',
  )
} finally {
  rmSync(directory, { recursive: true, force: true })
}
console.log(
  'Release self-check passed: privacy patterns, exact artifact selection, and SHA-256 manifest.',
)
