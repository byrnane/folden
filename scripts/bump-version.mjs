import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const changelogDraftLine = '* Черновик release notes.'

function printUsage() {
  console.error('Usage: npm run version:bump -- <major|minor|patch|x.y.z>')
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)

  if (!match) {
    throw new Error(`Invalid semver version: ${version}`)
  }

  return match.slice(1).map((part) => Number(part))
}

function bumpVersion(currentVersion, bumpType) {
  const [major, minor, patch] = parseVersion(currentVersion)

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      return bumpType
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

async function writeJson(relativePath, value) {
  await writeFile(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

async function writeText(relativePath, value) {
  await writeFile(path.join(root, relativePath), value, 'utf8')
}

function replaceCargoVersion(source, nextVersion) {
  const nextSource = source.replace(
    /^(\s*version\s*=\s*")([^"]+)(")/m,
    `$1${nextVersion}$3`,
  )

  if (nextSource === source) {
    throw new Error('Could not find package version in src-tauri/Cargo.toml')
  }

  return nextSource
}

function ensureChangelogHeading(source, nextVersion) {
  const releaseHeadingRegex = /^##\s+(\d+\.\d+\.\d+)\s+-\s+\d{4}-\d{2}-\d{2}\s*$/m
  const headingMatch = releaseHeadingRegex.exec(source)

  if (!headingMatch) {
    throw new Error('Could not find the latest release heading in CHANGELOG.md')
  }

  if (headingMatch[1] === nextVersion) {
    return source
  }

  const today = new Date().toISOString().slice(0, 10)
  const newEntry = `## ${nextVersion} - ${today}\n\n${changelogDraftLine}\n\n`
  return `${source.slice(0, headingMatch.index)}${newEntry}${source.slice(headingMatch.index)}`
}

const versionArg = process.argv[2]

if (!versionArg) {
  printUsage()
  process.exit(1)
}

const [packageJson, packageLock, tauriConfig, cargoToml, changelog] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('src-tauri/tauri.conf.json'),
  readText('src-tauri/Cargo.toml'),
  readText('CHANGELOG.md'),
])

const currentVersion = packageJson.version
const nextVersion = bumpVersion(currentVersion, versionArg)
parseVersion(nextVersion)

if (nextVersion === currentVersion) {
  console.log(`Version is already ${currentVersion}. No files changed.`)
  process.exit(0)
}

packageJson.version = nextVersion
packageLock.version = nextVersion
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = nextVersion
}
tauriConfig.version = nextVersion

await Promise.all([
  writeJson('package.json', packageJson),
  writeJson('package-lock.json', packageLock),
  writeJson('src-tauri/tauri.conf.json', tauriConfig),
  writeText('src-tauri/Cargo.toml', replaceCargoVersion(cargoToml, nextVersion)),
  writeText('CHANGELOG.md', ensureChangelogHeading(changelog, nextVersion)),
])

console.log(`Bumped version ${currentVersion} -> ${nextVersion}`)
