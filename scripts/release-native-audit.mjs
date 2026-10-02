import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { walkFiles } from './privacy-check.mjs'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
function output(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return result.status === 0 ? result.stdout.trim() : null
}
const buildId = (filename) =>
  output('readelf', ['--notes', filename])?.match(/Build ID: ([a-f0-9]+)/)?.[1]

function systemProvenance(filename, bytes) {
  const owners = output('dpkg-query', ['--search', `*/${path.basename(filename)}`])
  if (!owners) return null
  const packagedId = buildId(filename)
  for (const line of owners.split('\n')) {
    const split = line.indexOf(': ')
    if (split < 0) continue
    const owner = line.slice(0, split)
    const original = line.slice(split + 2)
    if (!existsSync(original)) continue
    const sameBytes = hash(readFileSync(original)) === hash(bytes)
    if (!sameBytes && (!packagedId || packagedId !== buildId(original))) continue
    const metadata = output('dpkg-query', [
      '--show',
      '--showformat=${Package}\t${Version}\t${source:Package}\t${source:Version}',
      owner,
    ])
    if (!metadata) continue
    const [name, version, sourceName, sourceVersion] = metadata.split('\t')
    const copyright = path.join('/usr/share/doc', name, 'copyright')
    if (!existsSync(copyright)) continue
    let licenseText = readFileSync(copyright, 'utf8')
    if (!/License:|copyright|permission|GNU/i.test(licenseText)) continue
    const references = new Set(
      licenseText.match(/\/usr\/share\/common-licenses\/[A-Za-z0-9+.-]+/g) || [],
    )
    if ([...references].some((reference) => !existsSync(reference))) continue
    for (const reference of references)
      licenseText += `\n\n## Referenced full license: ${path.basename(reference)}\n\n${readFileSync(reference, 'utf8')}`
    return {
      kind: 'Ubuntu package',
      package: name,
      version,
      sourcePackage: sourceName || name,
      sourceVersion: sourceVersion || version,
      source: `https://launchpad.net/ubuntu/+source/${encodeURIComponent(sourceName || name)}/${encodeURIComponent(sourceVersion || version)}`,
      licenseText,
      licenseTextSha256: hash(Buffer.from(licenseText)),
      matchedBy: sameBytes ? 'SHA-256' : 'ELF Build ID',
    }
  }
  return null
}

export function checkNativeAttribution(report) {
  if (report.unknownComponents.length)
    throw new Error(
      `AppImage license/source provenance is unresolved for ${report.unknownComponents.length} shipped native components; review .cache/native-package-audit/AppImage-components.json before release.`,
    )
  if (report.remainingReview)
    throw new Error(
      'AppImage whole-payload attribution is unfinished; finalize all payload attribution and notices inside both Linux packages and About before release.',
    )
}

export function auditNativeComponents(directory, packageFilename, applicationFilename) {
  const reviewed = JSON.parse(
    readFileSync('scripts/native-component-licenses.json', 'utf8'),
  ).components
  const components = []
  const payloadManifest = []
  function record(name, bytes, provenance) {
    const sha256 = hash(bytes)
    const approved = reviewed[sha256]
    if (
      !provenance &&
      approved?.source &&
      approved?.license &&
      approved?.licenseTextFile &&
      approved?.licenseTextSha256
    ) {
      const licenseText = readFileSync(approved.licenseTextFile, 'utf8')
      if (hash(Buffer.from(licenseText)) !== approved.licenseTextSha256)
        throw new Error('Reviewed native license text changed')
      provenance = {
        kind: 'Reviewed upstream component',
        source: approved.source,
        license: approved.license,
        licenseText,
        licenseTextSha256: approved.licenseTextSha256,
      }
    }
    components.push({ path: name, sha256, bytes: bytes.length, provenance })
  }
  for (const filename of walkFiles(directory)) {
    const bytes = readFileSync(filename)
    payloadManifest.push({
      path: path.relative(directory, filename).split(path.sep).join('/'),
      sha256: hash(bytes),
      bytes: bytes.length,
    })
    if (filename === applicationFilename) continue
    if (bytes.length >= 4 && bytes.toString('ascii', 1, 4) === 'ELF')
      record(
        path.relative(directory, filename).split(path.sep).join('/'),
        bytes,
        systemProvenance(filename, bytes),
      )
  }
  const offset = Number(output(path.resolve(packageFilename), ['--appimage-offset']))
  const image = readFileSync(packageFilename)
  if (!Number.isInteger(offset) || offset <= 0 || offset >= image.length)
    throw new Error('Cannot identify the shipped AppImage runtime')
  record('(AppImage runtime)', image.subarray(0, offset), null)
  const unknown = components.filter((component) => !component.provenance)
  const report = {
    package: path.basename(packageFilename),
    packageSha256: hash(image),
    components,
    payloadManifest,
    remainingReview:
      'Classify all non-ELF AppRun scripts, fonts, XML/configuration, themes and assets; finalize corresponding notices inside both packages and About. ELF provenance alone does not close distribution attribution.',
    unknownComponents: unknown.map(({ path: filename, sha256 }) => ({ path: filename, sha256 })),
  }
  const texts = new Map(
    components
      .filter((item) => item.provenance)
      .map((item) => [item.provenance.licenseTextSha256, item.provenance]),
  )
  const notices =
    '# Linux AppImage native components\n\nGenerated from the final extracted payload. These components are additional to npm/Cargo notices. Ubuntu ownership is proven by matching SHA-256 or ELF Build ID; reviewed upstream components are keyed by exact payload SHA-256.\n\n' +
    components
      .map(
        (item) =>
          `- ${item.path}: SHA-256 ${item.sha256}; ${item.provenance ? item.provenance.source : '**UNRESOLVED — release blocked**'}`,
      )
      .join('\n') +
    '\n\n' +
    [...texts.values()]
      .map((item) => `## ${item.kind}: ${item.source}\n\n${item.licenseText}`)
      .join('\n\n')
  const auditDirectory = path.join('.cache', 'native-package-audit')
  mkdirSync(auditDirectory, { recursive: true })
  writeFileSync(
    path.join(auditDirectory, 'AppImage-components.json'),
    JSON.stringify(report, null, 2) + '\n',
  )
  writeFileSync(path.join(auditDirectory, 'NATIVE_COMPONENTS_linux-x64.md'), notices)
  checkNativeAttribution(report)
  return path.join(auditDirectory, 'NATIVE_COMPONENTS_linux-x64.md')
}
