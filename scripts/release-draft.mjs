import { mkdirSync, readFileSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { checksumLines, stagedPackageNames, additionalReleaseFiles } from './release-verify.mjs'
import { releaseTargets } from './release-dependencies.mjs'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = process.env.RELEASE_TAG
if (tag !== `v${version}`) throw new Error('Draft tag/version mismatch')
const checkout = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
const changes = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
if (
  checkout.status !== 0 ||
  checkout.stdout.trim() !== process.env.RELEASE_COMMIT ||
  changes.status !== 0 ||
  changes.stdout.trim()
)
  throw new Error('Draft creation requires a clean checkout of the tested immutable commit')
const remote = spawnSync(
  'git',
  ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
  { encoding: 'utf8' },
)
const refs = remote.stdout
  .trim()
  .split('\n')
  .map((line) => line.split(/\s+/))
const commit = (refs.find(([, name]) => name === `refs/tags/${tag}^{}`) ||
  refs.find(([, name]) => name === `refs/tags/${tag}`) ||
  [])[0]
if (
  remote.status !== 0 ||
  !/^[a-f0-9]{40}$/.test(process.env.RELEASE_COMMIT || '') ||
  commit !== process.env.RELEASE_COMMIT
)
  throw new Error('Remote release tag moved or does not match the tested immutable commit')
const destination = path.join('build', 'draft', tag)
mkdirSync(path.join('build', 'draft'), { recursive: true })
mkdirSync(destination)
const files = []
let notices
for (const target of Object.values(releaseTargets)) {
  const directory = path.join('build', 'release', `folden-${target}`)
  const packages = stagedPackageNames(version, target)
  const names = [...packages, 'LICENSE.md', 'THIRD_PARTY_NOTICES.md']
  names.push(...additionalReleaseFiles(target))
  const expected = [...names, 'SHA256SUMS.txt'].sort()
  if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(expected))
    throw new Error(`Missing or unexpected ${target} files`)
  const checksums = checksumLines(names.map((name) => path.join(directory, name)))
  if (readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8') !== checksums)
    throw new Error(`Downloaded ${target} artifact checksum mismatch`)
  if (!readFileSync(path.join(directory, 'LICENSE.md')).equals(readFileSync('LICENSE.md')))
    throw new Error('Artifact contains stale LICENSE.md')
  const artifactNotices = readFileSync(path.join(directory, 'THIRD_PARTY_NOTICES.md'))
  if (notices && !artifactNotices.equals(notices))
    throw new Error('Package artifacts contain inconsistent third-party notices')
  notices = artifactNotices
  for (const name of packages) {
    const output = path.join(destination, name)
    copyFileSync(path.join(directory, name), output)
    files.push(output)
  }
  for (const name of additionalReleaseFiles(target)) {
    const output = path.join(destination, name)
    copyFileSync(path.join(directory, name), output)
    files.push(output)
  }
}
const terms = path.join(destination, 'LICENSE.md')
copyFileSync('LICENSE.md', terms)
files.push(terms)
const noticesPath = path.join(destination, 'THIRD_PARTY_NOTICES.md')
writeFileSync(noticesPath, notices)
files.push(noticesPath)
const sums = path.join(destination, 'SHA256SUMS.txt')
writeFileSync(sums, checksumLines(files))
files.push(sums)
const existing = spawnSync('gh', ['release', 'view', tag], { encoding: 'utf8' })
if (existing.status === 0)
  throw new Error('A release already exists; review it manually instead of replacing it.')
const result = spawnSync(
  'gh',
  [
    'release',
    'create',
    tag,
    '--verify-tag',
    '--draft',
    '--prerelease',
    '--title',
    `Folden ${version} beta`,
    '--notes-file',
    `docs/releases/v${version}.md`,
    ...files,
  ],
  { stdio: 'inherit' },
)
if (result.status !== 0) throw new Error('Draft prerelease creation failed')
