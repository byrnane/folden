import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'
import { findPrivacyIssues, sourcePrivacyIssues } from './privacy-check.mjs'
import {
  selectPackages,
  checksumLines,
  checkWindowsArchitecture,
  stagedPackageNames,
  additionalReleaseFiles,
  checkInstallerNativePayload,
  command,
} from './release-verify.mjs'
import { classifyCargoGraph, dependencyTargets, releaseTargets } from './release-dependencies.mjs'
import { checkNativeAttribution } from './release-native-audit.mjs'

assert.equal(
  command(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'Y\n' }),
  'Y\n',
)
assert.throws(
  () =>
    command(process.execPath, ['-e', "process.stderr.write('inspection failed'); process.exit(1)"]),
  /Package inspection failed: .* \(exit 1\): inspection failed/,
)

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
  Object.values(dependencyTargets).sort(),
  Object.keys((await import('./release-verify.mjs')).releaseFormats).sort(),
)
assert.deepEqual(Object.keys(releaseTargets), ['Windows x64', 'macOS x64', 'macOS arm64'])
const executable = Buffer.alloc(80)
executable.write('MZ')
executable.writeUInt32LE(64, 60)
executable.write('PE\0\0', 64)
executable.writeUInt16LE(0x8664, 68)
checkWindowsArchitecture(executable)
executable.writeUInt16LE(0x14c, 68)
assert.throws(() => checkWindowsArchitecture(executable))
mkdirSync('.cache', { recursive: true })
const directory = path.resolve(mkdtempSync(path.join('.cache', 'release-check-')))
assert.equal(path.dirname(directory), path.resolve('.cache'))
try {
  const licenseCheck = spawnSync(
    process.execPath,
    ['scripts/third-party-notices.mjs', '--self-check'],
    {
      encoding: 'utf8',
    },
  )
  assert.equal(licenseCheck.status, 0, licenseCheck.stderr)
  const filename = path.join(directory, 'example.txt')
  writeFileSync(filename, 'abc')
  assert.equal(
    checksumLines([filename]),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  example.txt\n',
  )
  const version = '0.12.0'
  const notices = Buffer.from('Third-party fixture\r\n')
  mkdirSync(path.join(directory, 'scripts'))
  writeFileSync(
    path.join(directory, 'scripts', 'native-distribution-licenses.json'),
    readFileSync('scripts/native-distribution-licenses.json'),
  )
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version }))
  writeFileSync(path.join(directory, 'LICENSE.md'), 'Fixture usage terms\n')
  for (const target of Object.values(releaseTargets)) {
    const artifact = path.join(directory, 'build', 'release', `folden-${target}`)
    mkdirSync(artifact, { recursive: true })
    const names = [
      ...stagedPackageNames(version, target),
      ...additionalReleaseFiles(target),
      'LICENSE.md',
      'THIRD_PARTY_NOTICES.md',
    ]
    for (const name of names)
      writeFileSync(
        path.join(artifact, name),
        name === 'THIRD_PARTY_NOTICES.md'
          ? notices
          : name === 'LICENSE.md'
            ? 'Fixture usage terms\n'
            : 'Fixture payload\n',
      )
    writeFileSync(
      path.join(artifact, 'SHA256SUMS.txt'),
      checksumLines(names.map((name) => path.join(artifact, name))),
    )
  }
  const preload = path.join(directory, 'mock-commands.cjs')
  writeFileSync(
    preload,
    `
const { writeFileSync } = require('node:fs')
require('node:child_process').spawnSync = (command, args) => {
  if (command === 'git') return {
    status: 0,
    stdout: args[0] === 'status' ? '' : args[0] === 'ls-remote'
      ? process.env.RELEASE_COMMIT + '\\trefs/tags/' + process.env.RELEASE_TAG + '\\n'
      : process.env.RELEASE_COMMIT + '\\n',
  }
  if (command === 'gh' && args[0] === 'release' && args[1] === 'view') return { status: 1 }
  if (command === 'gh' && args[0] === 'release' && args[1] === 'create') {
    writeFileSync('gh-created.json', JSON.stringify(args))
    return { status: 0 }
  }
  throw new Error('Unexpected test command: ' + command)
}
require('node:module').syncBuiltinESMExports()
`,
  )
  const runDraft = () =>
    spawnSync(process.execPath, ['--require', preload, path.resolve('scripts/release-draft.mjs')], {
      cwd: directory,
      env: { ...process.env, RELEASE_TAG: `v${version}`, RELEASE_COMMIT: 'a'.repeat(40) },
      encoding: 'utf8',
    })
  const created = path.join(directory, 'gh-created.json')
  const draft = path.join(directory, 'build', 'draft', `v${version}`)
  assert(!existsSync(path.join(directory, 'THIRD_PARTY_NOTICES.md')))
  const successfulDraft = runDraft()
  assert.equal(successfulDraft.status, 0, successfulDraft.stderr)
  assert(existsSync(created))
  assert(readFileSync(path.join(draft, 'THIRD_PARTY_NOTICES.md')).equals(notices))
  assert(draft.startsWith(`${directory}${path.sep}`))
  rmSync(draft, { recursive: true })
  rmSync(created)
  const changedArtifact = path.join(
    directory,
    'build',
    'release',
    `folden-${Object.values(releaseTargets).at(-1)}`,
  )
  writeFileSync(path.join(changedArtifact, 'THIRD_PARTY_NOTICES.md'), 'Different notices\n')
  writeFileSync(
    path.join(changedArtifact, 'SHA256SUMS.txt'),
    checksumLines(
      readdirSync(changedArtifact)
        .filter((name) => name !== 'SHA256SUMS.txt')
        .map((name) => path.join(changedArtifact, name)),
    ),
  )
  const rejectedDraft = runDraft()
  assert.notEqual(rejectedDraft.status, 0)
  assert.match(rejectedDraft.stderr, /inconsistent third-party notices/)
  assert(!existsSync(created))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
console.log(
  'Release self-check passed: privacy patterns, exact artifact selection, SHA-256 manifest, and draft artifact notices.',
)
