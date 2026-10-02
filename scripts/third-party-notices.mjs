import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { format } from 'prettier'
import { classifyCargoGraph, releaseTargets } from './release-dependencies.mjs'

const targets = Object.values(releaseTargets)
const root = process.cwd()
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const records = []
const texts = new Map()
const overrides = JSON.parse(readFileSync('scripts/third-party-license-overrides.json', 'utf8'))
const distributions = JSON.parse(readFileSync('scripts/native-distribution-licenses.json', 'utf8'))
if (lock.packages['node_modules/@tauri-apps/cli'].version !== distributions.tauriCliVersion)
  throw new Error('Native distribution inventory needs review for the changed Tauri CLI version')

function licenseTexts(directory, declaredFile) {
  const names = readdirSync(directory, { withFileTypes: true })
    .filter(
      (item) =>
        item.isFile() && /^(?:licen[cs]e|copying|notice|copyright)(?:[._-]|$)/i.test(item.name),
    )
    .map((item) => item.name)
  if (declaredFile && !names.includes(declaredFile)) names.push(declaredFile)
  if (names.length === 0) throw new Error(`No license text found for ${path.basename(directory)}`)
  return names.sort().map((name) => {
    const text = readFileSync(path.join(directory, name), 'utf8').replace(/\r\n/g, '\n').trim()
    const id = createHash('sha256').update(text).digest('hex').slice(0, 12)
    texts.set(id, text)
    return id
  })
}

for (const [directory, entry] of Object.entries(lock.packages)) {
  if (!directory || entry.dev) continue
  const installed = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  if (installed.version !== entry.version || installed.license !== entry.license) {
    throw new Error(`Installed package differs from lockfile: ${directory}`)
  }
  records.push({
    name: `npm:${installed.name}`,
    version: entry.version,
    license: entry.license,
    source: entry.resolved,
    texts: licenseTexts(directory),
    scopes: targets.map(() => 'npm production graph'),
  })
}

const crates = new Map()
const nativeScopes = new Map()
for (const target of targets) {
  const result = spawnSync(
    'cargo',
    [
      'metadata',
      '--offline',
      '--locked',
      '--format-version',
      '1',
      '--filter-platform',
      target,
      '--manifest-path',
      'src-tauri/Cargo.toml',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(
      `Cargo metadata failed for ${target}; run cargo fetch --locked --manifest-path src-tauri/Cargo.toml --target ${target} first.`,
    )
  }
  const metadata = JSON.parse(result.stdout)
  const resolved = classifyCargoGraph(metadata)
  for (const crate of metadata.packages) {
    if (crate.source && resolved.has(crate.id)) {
      crates.set(crate.id, crate)
      if (!nativeScopes.has(crate.id)) nativeScopes.set(crate.id, {})
      nativeScopes.get(crate.id)[target] = [...resolved.get(crate.id)].sort().join(' + ')
    }
  }
}
for (const crate of crates.values()) {
  if (!crate.license) throw new Error(`Missing license metadata: ${crate.name} ${crate.version}`)
  const directory = path.dirname(crate.manifest_path)
  const override = overrides.entries[`${crate.name}@${crate.version}`]
  if (override) {
    for (const id of override.texts) texts.set(id, overrides.texts[id])
  }
  records.push({
    name: `cargo:${crate.name}`,
    version: crate.version,
    license: crate.license,
    source: `https://crates.io/api/v1/crates/${crate.name}/${crate.version}/download`,
    texts: override ? override.texts : licenseTexts(directory, crate.license_file),
    provenance: override?.sources,
    scopes: targets.map((target) => nativeScopes.get(crate.id)[target] || '—'),
  })
}
for (const component of distributions.components) {
  const ids = component.licenseFiles.map((filename) => {
    const text = readFileSync(filename, 'utf8').replace(/\r\n/g, '\n').trim()
    const id = createHash('sha256').update(text).digest('hex').slice(0, 12)
    texts.set(id, text)
    return id
  })
  records.push({
    name: component.name,
    version: component.version,
    license: component.license,
    source: component.source,
    texts: ids,
    includes: component.includes,
    scopes: targets.map((target) =>
      component.platform === 'all' || target === component.platform ? component.scope : '—',
    ),
  })
}
records.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'))
let output = '# Third-party notices\n\n'
output +=
  'Generated from the locked npm production dependency graph and the reachable Cargo runtime/build graphs for Windows x64, Linux x64, and macOS x64/arm64. Build dependencies and procedural macros are labelled separately per target. This is a conservative dependency inventory, not a claim that every component is present in every binary: npm metadata includes frontend build tooling, and compilers may eliminate unused code. Third-party permissions remain independent of the Folden license.\n\n'
output +=
  'Regenerate with `npm run licenses:generate`; verify with `npm run licenses:check`. Install the locked npm packages and fetch Cargo sources for the four supported targets first. No private registry paths or project author contact details are included.\n\n'
output +=
  'Where published crate archives omit license files, a checked-in catalog records the pinned upstream license and attribution sources. When upstream only declares the MIT identifier, canonical MIT terms and its published authors are explicitly identified rather than inventing an original copyright notice.\n\n'
output +=
  '## Native distribution components\n\nWindows installer runtime/plugin notices are included below. AppImage libraries/runtime are audited separately from the actual Linux payload; the npm/Cargo inventory does not claim to cover them. Folden restrictions do not override any third-party source or binary rights.\n\n'
for (const component of distributions.components)
  output += `- ${component.name} ${component.version}: ${component.includes.join(', ')}. [Corresponding upstream source](${component.source}). Original license conditions, including linking exceptions, are reproduced in full below.\n`
for (const component of distributions.components.filter((item) => item.sourceArchiveFilename))
  output += `- The distributor supplies the unmodified ${component.name} ${component.version} source archive beside the Windows installer: [${component.sourceArchiveFilename}](https://github.com/byrnane/folden/releases/download/v${lock.version}/${component.sourceArchiveFilename}), SHA-256 ${component.sourceSha256}. Obtain this archive from the same official release page; its third-party source rights remain unchanged by the Folden license.\n`
output +=
  '- The prebuilt NSIS utils release declares semver 1.x under MIT/Apache-2.0 but does not publish its resolved Cargo.lock. Its exact compiled patch version is not claimed here; the semver copyright/license texts appear in the Cargo inventory. The plugin source tag and actual DLL SHA-256 are recorded in scripts/native-distribution-licenses.json.\n'
output += '\n'
output += '## MPL source availability\n\n'
output +=
  'The MPL-2.0 components below are unmodified third-party code. Their exact source archives, including their original license notices, are available at the versioned source links below. These components remain under MPL-2.0; Folden-specific restrictions do not restrict their source rights.\n\n'
for (const record of records.filter((item) => item.license.includes('MPL-2.0'))) {
  output += `- [${record.name} ${record.version}](${record.source})\n`
}
output +=
  '\n## Locked dependency inventory\n\n| Component | Version | License expression | Windows x64 | Linux x64 | macOS x64 | macOS arm64 | Exact source | License texts |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
for (const record of records) {
  const links = record.texts.map((id) => `[${id}](#license-${id})`).join(', ')
  output += `| ${record.name} | ${record.version} | ${record.license} | ${record.scopes.join(' | ')} | [source](${record.source}) | ${links} |\n`
}
output += '\n## License and attribution texts\n\n'
for (const record of records.filter((item) => item.provenance)) {
  output += `- ${record.name} ${record.version}: ${record.provenance.map((url) => `[upstream notice](${url})`).join(', ')}\n`
}
output += '\n'
for (const [id, text] of [...texts].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  output += `### License ${id}\n\n\`\`\`\`text\n${text}\n\`\`\`\`\n\n`
}
output = await format(output, { parser: 'markdown', printWidth: 100, endOfLine: 'lf' })
const destination = path.join(root, 'THIRD_PARTY_NOTICES.md')
if (process.argv.includes('--check')) {
  if (!existsSync(destination) || readFileSync(destination, 'utf8') !== output) {
    throw new Error('THIRD_PARTY_NOTICES.md is stale; run npm run licenses:generate.')
  }
} else {
  const temporary = `${destination}.tmp`
  writeFileSync(temporary, output, { encoding: 'utf8', flag: 'wx' })
  renameSync(temporary, destination)
}
console.log(
  `Third-party notices verified: ${records.length} dependency records, ${texts.size} license/attribution texts.`,
)
