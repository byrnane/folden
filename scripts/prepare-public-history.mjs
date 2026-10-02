import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import {
  excludedPublicPaths,
  privateGitValues,
  sourcePrivacyIssues,
  findPrivacyIssues,
  walkFiles,
} from './privacy-check.mjs'

// This command only creates an ignored review copy. It never changes original refs/index or a remote.
const root = process.cwd()
const directory = path.resolve('.cache', 'public-history')
if (path.dirname(directory) !== path.resolve('.cache')) throw new Error('Unsafe review directory')
const repository = path.join(directory, 'sanitized-reviewed.git')
const exportDirectory = path.join(directory, 'source')
const manifestFilename = path.join(directory, 'review-manifest.json')
const refreshSource = process.argv.includes('--refresh-source')
const previous = existsSync(manifestFilename)
  ? JSON.parse(readFileSync(manifestFilename, 'utf8'))
  : null
const tool = path.join(directory, 'git-filter-repo.py')
const toolHash = '39d35fb2c35637a9d555353b6a8b53a223a227d3beb61a0ac7e1180bfa5572f1'
const bundle = path.resolve('.cache', 'private-release-backup-20261002', 'original.bundle')
const historicalExclusions = [...excludedPublicPaths, 'test_files/test.png']
const sourceExclusions = [...excludedPublicPaths, 'THIRD_PARTY_NOTICES.md', 'scripts/licenses/']
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
function command(name, args, cwd = root, binary = false) {
  const result = spawnSync(name, args, {
    cwd,
    encoding: binary ? null : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`Review-copy command failed: ${name} ${args[0]}`)
  return result.stdout
}
function excluded(filename, paths = historicalExclusions) {
  return paths.some((item) => (item.endsWith('/') ? filename.startsWith(item) : filename === item))
}
const originalRefs = command('git', ['show-ref'])
const index = path.join(root, '.git', 'index')
const originalIndexHash = sha256(readFileSync(index))
const privateValues = privateGitValues(root)
mkdirSync(directory, { recursive: true })
if (!existsSync(tool) || sha256(readFileSync(tool)) !== toolHash)
  throw new Error('Pinned official git-filter-repo tool is missing or changed')
if (!existsSync(repository)) {
  command('git', ['clone', '--mirror', bundle, repository])
  if (path.dirname(repository) !== directory) throw new Error('Unsafe history target')
  command(
    'python',
    [
      tool,
      '--force',
      ...historicalExclusions.flatMap((item) => ['--path', item]),
      '--invert-paths',
      '--name-callback',
      'return b"byrnane"',
      '--email-callback',
      'return b"12965194+byrnane@users.noreply.github.com"',
    ],
    repository,
  )
}
// Codex checkpoint refs can point straight to trees; they are private tooling state, not public branches/tags.
const nonPublicRefs = command('git', ['for-each-ref', '--format=%(refname)'], repository)
  .trim()
  .split('\n')
  .filter((ref) => ref && !/^refs\/(heads|tags)\//.test(ref))
if (nonPublicRefs.length) {
  const result = spawnSync('git', ['update-ref', '--stdin'], {
    cwd: repository,
    input: nonPublicRefs.map((ref) => `delete ${ref}\n`).join(''),
    encoding: 'utf8',
  })
  if (result.status !== 0)
    throw new Error('Cannot exclude private tooling refs from the separate copy')
}
command('git', ['gc', '--prune=now', '--quiet'], repository)
if (command('git', ['fsck', '--full', '--no-reflogs'], repository).trim())
  throw new Error('Review copy contains unreachable or damaged objects')
const identities = privateGitValues(repository)
if (identities.length) throw new Error('Review history retains private author/committer identities')
const mapping = new Map(
  readFileSync(path.join(repository, 'filter-repo', 'commit-map'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/)),
)
const tree = (commit, cwd, filter) =>
  command('git', ['ls-tree', '-r', '--full-tree', commit], cwd)
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((line) => !filter || !excluded(line.slice(line.indexOf('\t') + 1)))
    .sort()
    .join('\n')
let compared = 0
for (const [oldCommit, newCommit] of mapping) {
  if (/^0+$/.test(newCommit)) {
    const parents = command('git', ['show', '-s', '--format=%P', oldCommit])
      .trim()
      .split(' ')
      .filter(Boolean)
    if (!parents.some((parent) => tree(parent, root, true) === tree(oldCommit, root, true)))
      throw new Error('Cannot prove preserved tree of a removed empty commit')
  } else if (tree(oldCommit, root, true) !== tree(newCommit, repository, false)) {
    throw new Error('Unapproved historical source-tree change')
  }
  compared++
}
const messages = command('git', ['log', '--all', '--format=%B%x00'], repository)
if (findPrivacyIssues(messages, privateValues).length)
  throw new Error('Private data remains in historical commit messages')
const tags = command(
  'git',
  ['for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags'],
  repository,
)
  .trim()
  .split('\n')
  .filter(Boolean)
for (const tag of tags) {
  const [type, object] = tag.split(' ')
  if (
    type === 'tag' &&
    findPrivacyIssues(command('git', ['cat-file', 'tag', object], repository), privateValues).length
  )
    throw new Error('Private data remains in annotated tag metadata/text')
}
const objects = command('git', ['rev-list', '--objects', '--all'], repository).trim().split('\n')
if (
  refreshSource &&
  (!previous ||
    previous.repository !== repository ||
    previous.originalHead !== command('git', ['rev-parse', 'HEAD']).trim() ||
    previous.comparedCommits !== mapping.size ||
    !previous.checkedBlobs)
)
  throw new Error('Source-only refresh requires the prior verified history manifest')
const verifiedCommits = new Set(mapping.values())
if (
  command('git', ['rev-list', '--all'], repository)
    .trim()
    .split('\n')
    .some((commit) => !verifiedCommits.has(commit))
)
  throw new Error('Review history contains an unverified commit')
let checkedBlobs = refreshSource ? previous.checkedBlobs : 0
for (const line of refreshSource ? [] : objects) {
  const [object] = line.split(' ')
  const filename = line.slice(object.length + 1)
  if (!filename || command('git', ['cat-file', '-t', object], repository).trim() !== 'blob')
    continue
  if (excluded(filename)) throw new Error('Excluded file remains in review history')
  const bytes = command('git', ['cat-file', 'blob', object], repository, true)
  checkedBlobs++
  if (
    !bytes.includes(0) &&
    sourcePrivacyIssues(bytes.toString('utf8'), filename, privateValues).length
  )
    throw new Error(`Private data remains in history: ${filename}`)
}
mkdirSync(exportDirectory, { recursive: true })
const sourceFiles = command('git', ['ls-files', '-co', '--exclude-standard']).trim().split('\n')
const manifest = []
for (const filename of [...new Set(sourceFiles)].sort()) {
  if (!filename || excluded(filename, sourceExclusions) || !existsSync(filename)) continue
  const bytes = readFileSync(filename)
  if (
    !bytes.includes(0) &&
    sourcePrivacyIssues(bytes.toString('utf8'), filename, privateValues).length
  )
    throw new Error(`Private data remains in source export: ${filename}`)
  const output = path.resolve(exportDirectory, filename)
  if (!output.startsWith(exportDirectory + path.sep)) throw new Error('Unsafe source export path')
  mkdirSync(path.dirname(output), { recursive: true })
  copyFileSync(filename, output)
  if (sha256(readFileSync(output)) !== sha256(bytes)) throw new Error('Source export bytes differ')
  manifest.push({ path: filename, sha256: sha256(bytes), size: bytes.length })
}
const expectedFiles = new Set(manifest.map((file) => path.resolve(exportDirectory, file.path)))
for (const file of walkFiles(exportDirectory)) {
  if (!file.startsWith(exportDirectory + path.sep)) throw new Error('Unsafe stale export path')
  if (!expectedFiles.has(file)) rmSync(file)
}
if (
  command('git', ['show-ref']) !== originalRefs ||
  sha256(readFileSync(index)) !== originalIndexHash
)
  throw new Error('Original Git refs/index changed during review preparation')
const report = {
  repository,
  exportDirectory,
  originalHead: command('git', ['rev-parse', 'HEAD']).trim(),
  comparedCommits: compared,
  checkedBlobs,
  checkedTags: tags.length,
  excludedHistoryPaths: historicalExclusions,
  excludedSourcePaths: sourceExclusions,
  privateToolingRefsExcluded: nonPublicRefs.length,
  privateIdentitiesRemaining: identities.length,
  originalRefsPreserved: true,
  originalIndexPreserved: true,
  tool: { commit: 'd7b75aca907380f608892cc289e616f195427b99', sha256: toolHash },
  files: manifest,
}
writeFileSync(manifestFilename, JSON.stringify(report, null, 2) + '\n')
console.log(
  `Review history prepared: ${compared} preserved commit trees, ${checkedBlobs} blobs, ${manifest.length} byte-identical current source files; original refs/index unchanged.`,
)
