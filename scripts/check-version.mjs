import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

async function readJson(relativePath) {
  const fullPath = path.join(root, relativePath)
  return JSON.parse(await readFile(fullPath, 'utf8'))
}

async function readText(relativePath) {
  const fullPath = path.join(root, relativePath)
  return readFile(fullPath, 'utf8')
}

function readCargoVersion(source) {
  const versionMatch = source.match(/^\s*version\s*=\s*"([^"]+)"/m)

  if (!versionMatch) {
    throw new Error('Could not find package version in src-tauri/Cargo.toml')
  }

  return versionMatch[1]
}

function readLatestChangelogVersion(source) {
  const versionMatch = source.match(/^##\s+([0-9]+\.[0-9]+\.[0-9]+)\s+-/m)

  if (!versionMatch) {
    throw new Error('Could not find the latest release heading in CHANGELOG.md')
  }

  return versionMatch[1]
}

const [packageJson, packageLock, tauriConfig, cargoToml, changelog] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('src-tauri/tauri.conf.json'),
  readText('src-tauri/Cargo.toml'),
  readText('CHANGELOG.md'),
])

const expectedVersion = packageJson.version
const checks = [
  ['package.json', packageJson.version],
  ['package-lock.json', packageLock.version],
  ['package-lock.json packages[""]', packageLock.packages?.['']?.version],
  ['src-tauri/tauri.conf.json', tauriConfig.version],
  ['src-tauri/Cargo.toml', readCargoVersion(cargoToml)],
  ['CHANGELOG.md', readLatestChangelogVersion(changelog)],
]

const mismatches = checks.filter(([, version]) => version !== expectedVersion)

if (mismatches.length > 0) {
  const lines = mismatches.map(([label, version]) => `- ${label}: expected ${expectedVersion}, found ${version}`)
  console.error(`Version mismatch detected:\n${lines.join('\n')}`)
  process.exit(1)
}

console.log(`All tracked versions are aligned at ${expectedVersion}.`)
