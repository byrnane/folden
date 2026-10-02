import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    'access token',
    /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}/,
  ],
  ['credential URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
  [
    'secret assignment',
    /(?:api[_-]?key|secret|(?<!publicKey)token|password|passwd)\s*[:=]\s*["'][A-Za-z0-9/+_=-]{16,}/i,
  ],
  ['private user path', /[A-Z]:[\\/]Users[\\/][\w.-]+[\\/]|\/(?:Users|home)\/[\w.-]+\//i],
]

// Reviewed, deterministic fixtures; every other path and every secret still fails.
const home = '/home/' + 'Max/'
const mac = '/Users/' + 'Max/'
const syntheticPaths = {
  'src-tauri/src/lib.rs': [
    'opened ' +
      mac +
      'Secret note.md\\nfailed /home/' +
      'max/private.md\\nURL https://example.com/image.png',
  ],
  'tests/unit/application/controllers/workspaceController.test.ts': [
    home + 'Notes/notes/Draft.md',
    home + 'Notes/',
  ],
  'tests/unit/application/helpers/pathHelpers.test.ts': [
    home + 'Notes/daily/Draft.md',
    home + 'Notes/',
    mac + 'Notes/Draft.md',
    home + 'Draft.md',
  ],
  'tests/unit/application/sessionRecovery.test.ts': [home + 'Draft.md'],
  'tests/unit/application/state/documentState.test.ts': [
    home + 'notes/Draft.md',
    home + 'notes/draft.md',
    home + 'archive/Draft.md',
    home + 'archive/draft.md',
  ],
  'tests/unit/domain/markdown/imageRendering.test.ts': [
    home + 'Notes/daily.md',
    home + 'shared/cover one.png#preview',
    mac + 'Notes/daily.md',
    mac + 'images/logo.png',
  ],
}

export const excludedPublicPaths = [
  '.codex/',
  'AGENTS.md',
  'AGENTS.universal.md',
  'logo_concept.png',
  'logos.png',
  'plans/folden_future_search.md',
  'docs/BETA-0.11.0.md',
  'docs/BETA-0.11.0.ru.md',
]

export function sourcePrivacyIssues(content, filename, privateValues = []) {
  let inspected = content
  for (const fixture of syntheticPaths[filename.replaceAll('\\', '/')] || []) {
    for (const quote of ["'", '"']) {
      for (const prefix of ['', 'file:']) {
        inspected = inspected.replaceAll(
          quote + prefix + fixture + quote,
          quote + '[synthetic fixture]' + quote,
        )
      }
    }
  }
  return findPrivacyIssues(inspected, privateValues)
}

export function findPrivacyIssues(content, privateValues = []) {
  const issues = patterns.filter(([, pattern]) => pattern.test(content)).map(([name]) => name)
  if (privateValues.some((value) => value.length > 3 && content.includes(value))) {
    issues.push('private Git identity')
  }
  return issues
}

export function walkFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const filename = path.join(directory, entry)
    const stat = lstatSync(filename)
    if (stat.isDirectory()) files.push(...walkFiles(filename))
    else if (stat.isFile()) files.push(filename)
  }
  return files
}

export function checkFilePrivacy(filename, privateValues = []) {
  const bytes = readFileSync(filename)
  const issues = new Set(findPrivacyIssues(bytes.toString('utf8'), privateValues))
  if (bytes.includes(0)) {
    for (const issue of findPrivacyIssues(bytes.toString('utf16le'), privateValues))
      issues.add(issue)
  }
  return [...issues]
}

function git(args, cwd = process.cwd()) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`Git privacy inspection failed: ${args[0]}`)
  return result.stdout
}

export function privateGitValues(directory = process.cwd()) {
  const values = git(['log', '--all', '--format=%an%x09%ae%x09%cn%x09%ce'], directory)
    .trim()
    .split('\n')
    .flatMap((line) => line.split('\t'))
  return [...new Set(values)].filter(
    (value) =>
      !['byrnane', 'GitHub', 'noreply@github.com', 'github-actions[bot]'].includes(value) &&
      !/@users\.noreply\.github\.com$/i.test(value),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const historyIndex = process.argv.indexOf('--history')
  const directory = historyIndex >= 0 ? path.resolve(process.argv[historyIndex + 1]) : process.cwd()
  const privateValues = privateGitValues(directory)
  const identityIndex = process.argv.indexOf('--identity-source')
  const identities =
    historyIndex >= 0
      ? [
          ...new Set([
            ...privateValues,
            ...privateGitValues(
              identityIndex >= 0 ? path.resolve(process.argv[identityIndex + 1]) : process.cwd(),
            ),
          ]),
        ]
      : privateValues
  const failures = []
  let checked = 0
  if (historyIndex >= 0) {
    if (privateValues.length) failures.push('history: private author/committer identity remains')
    if (findPrivacyIssues(git(['log', '--all', '--format=%B%x00'], directory), identities).length)
      failures.push('history: private data in commit messages')
    for (const line of git(
      ['for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags'],
      directory,
    )
      .trim()
      .split('\n')
      .filter(Boolean)) {
      const [type, object] = line.split(' ')
      if (
        type === 'tag' &&
        findPrivacyIssues(git(['cat-file', 'tag', object], directory), identities).length
      )
        failures.push('history: private data in annotated tag metadata/text')
    }
    const objects = git(['rev-list', '--objects', '--all'], directory).trim().split('\n')
    const names = new Map(
      objects.map((line) => {
        const split = line.indexOf(' ')
        return [
          split < 0 ? line : line.slice(0, split),
          split < 0 ? '(Git metadata)' : line.slice(split + 1),
        ]
      }),
    )
    const info = git(
      [
        'cat-file',
        '--batch-all-objects',
        '--batch-check=%(objectname) %(objecttype) %(objectsize)',
      ],
      directory,
    )
    for (const line of info.trim().split('\n')) {
      const [id, type, size] = line.split(' ')
      if (type !== 'blob' || !names.has(id)) continue
      if (Number(size) > 16 * 1024 * 1024) throw new Error('Unexpectedly large source blob')
      const result = spawnSync('git', ['cat-file', 'blob', id], {
        cwd: directory,
        maxBuffer: 32 * 1024 * 1024,
      })
      if (result.status !== 0) throw new Error('Cannot read source blob')
      checked++
      // PNG pixel data can coincidentally resemble tokens. Image metadata is inspected separately.
      if (result.stdout.includes(0)) continue
      const issues = sourcePrivacyIssues(result.stdout.toString('utf8'), names.get(id), identities)
      if (issues.length) failures.push(`${names.get(id)}: ${issues.join(', ')}`)
    }
  } else {
    const files = git(['ls-files', '-co', '--exclude-standard']).trim().split('\n')
    for (const filename of new Set(files)) {
      if (!filename || !existsSync(filename)) continue
      checked++
      const bytes = readFileSync(filename)
      if (bytes.includes(0)) continue
      const issues = sourcePrivacyIssues(bytes.toString('utf8'), filename, privateValues)
      if (issues.length) failures.push(`${filename}: ${issues.join(', ')}`)
    }
  }
  if (failures.length)
    throw new Error(`Privacy check failed:\n${[...new Set(failures)].join('\n')}`)
  console.log(
    `Privacy check passed: ${checked} source files/blobs; no matched private values were printed.`,
  )
}
