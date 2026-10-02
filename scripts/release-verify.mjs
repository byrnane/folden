import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  chmodSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  checkFilePrivacy,
  findPrivacyIssues,
  walkFiles,
  privateGitValues,
} from './privacy-check.mjs'
import { auditNativeComponents } from './release-native-audit.mjs'
const nativeDistributions = JSON.parse(
  readFileSync('scripts/native-distribution-licenses.json', 'utf8'),
).components
const installerNativeHashes = Object.assign(
  {},
  ...nativeDistributions.map((item) => item.payloadHashes || {}),
  ...nativeDistributions
    .filter((item) => item.payloadFilename)
    .map((item) => ({ [item.payloadFilename]: item.payloadSha256 })),
)

export function checkInstallerNativePayload(name, bytes) {
  const expected = installerNativeHashes[name]
  if (/\.dll$/i.test(name) && !expected)
    throw new Error(`Unknown installer native component: ${name}`)
  if (expected && createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error(
      `Installer native component differs from its reviewed licensed payload: ${name}`,
    )
}

export const releaseFormats = {
  'x86_64-pc-windows-msvc': ['.exe'],
  'x86_64-unknown-linux-gnu': ['.AppImage', '.deb'],
  'x86_64-apple-darwin': ['.dmg'],
  'aarch64-apple-darwin': ['.dmg'],
}
const labels = {
  'x86_64-pc-windows-msvc': 'windows-x64-setup',
  'x86_64-unknown-linux-gnu': 'linux-x64',
  'x86_64-apple-darwin': 'macos-x64',
  'aarch64-apple-darwin': 'macos-arm64',
}

export function stagedPackageNames(version, target) {
  if (!releaseFormats[target]) throw new Error('Unsupported release target')
  return releaseFormats[target].map(
    (extension) => `Folden_${version}_${labels[target]}${extension}`,
  )
}

export function additionalReleaseFiles(target) {
  const names = nativeDistributions
    .filter((item) => item.platform === target && item.sourceArchiveFilename)
    .map((item) => item.sourceArchiveFilename)
  if (target.includes('linux')) names.push('NATIVE_COMPONENTS_linux-x64.md')
  return names
}

async function distributionSource(component) {
  const directory = path.join('.cache', 'native-distribution-sources')
  mkdirSync(directory, { recursive: true })
  const filename = path.join(directory, component.sourceArchiveFilename)
  let bytes
  if (existsSync(filename)) bytes = readFileSync(filename)
  else {
    const cached = path.join('.cache', 'nsis-license-audit', component.sourceArchiveFilename)
    if (existsSync(cached)) bytes = readFileSync(cached)
    else {
      const response = await globalThis.fetch(component.source)
      if (!response.ok) throw new Error('Cannot obtain required third-party source archive')
      bytes = Buffer.from(await response.arrayBuffer())
    }
    if (createHash('sha256').update(bytes).digest('hex') !== component.sourceSha256)
      throw new Error('Third-party source archive checksum mismatch')
    writeFileSync(filename, bytes)
  }
  if (createHash('sha256').update(bytes).digest('hex') !== component.sourceSha256)
    throw new Error('Cached third-party source archive checksum mismatch')
  return filename
}

export function selectPackages(files, version, target) {
  const extensions = releaseFormats[target]
  if (!extensions) throw new Error('Unsupported release target')
  return extensions.map((extension) => {
    const matches = files.filter(
      (filename) =>
        path.basename(filename, extension).split(/[_-]/).includes(version) &&
        filename.endsWith(extension),
    )
    if (matches.length !== 1)
      throw new Error(`Expected exactly one ${extension} package for ${version}.`)
    if (/Beta Smoke/i.test(path.basename(matches[0])))
      throw new Error('A smoke installer is not a release artifact.')
    return matches[0]
  })
}

export function checksumLines(files) {
  return (
    files
      .sort()
      .map(
        (filename) =>
          `${createHash('sha256').update(readFileSync(filename)).digest('hex')}  ${path.basename(filename)}`,
      )
      .join('\n') + '\n'
  )
}

export function checkWindowsArchitecture(payload) {
  if (payload.length < 64 || payload.toString('ascii', 0, 2) !== 'MZ')
    throw new Error('Invalid Windows executable')
  const offset = payload.readUInt32LE(60)
  if (
    offset + 6 > payload.length ||
    payload.toString('ascii', offset, offset + 4) !== 'PE\0\0' ||
    payload.readUInt16LE(offset + 4) !== 0x8664
  ) {
    throw new Error('Installer executable is not Windows x64')
  }
}

export function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr?.toString().trim()
    throw new Error(
      `Package inspection failed: ${name} (exit ${result.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  return result.stdout
}

function verifyResources(files, privateValues = []) {
  for (const name of ['LICENSE.md', 'THIRD_PARTY_NOTICES.md']) {
    const matches = files.filter((file) => path.basename(file) === name)
    if (!matches.length) throw new Error(`Package is missing ${name}`)
    if (!matches.some((file) => readFileSync(file).equals(readFileSync(name)))) {
      throw new Error(`Packaged ${name} differs from the current release text`)
    }
  }
  for (const file of files) {
    if (/\.(?:pdb|dmp|map|log)$/i.test(file))
      throw new Error(`Unexpected debug/private artifact: ${path.basename(file)}`)
    const issues = checkFilePrivacy(file, privateValues)
    if (issues.length)
      throw new Error(`Package privacy failed: ${path.basename(file)} (${issues.join(', ')})`)
  }
}

function inspectWindows(filename, version, privateValues) {
  const listing = command('7z', ['l', '-slt', filename])
  const entries = listing
    .split('\n')
    .filter((line) => line.startsWith('Path = '))
    .map((line) => line.slice(7).trim())
    .slice(1)
  for (const entry of entries) {
    if (/\.(?:pdb|dmp|map|log)$/i.test(entry))
      throw new Error(`Unexpected installer artifact: ${path.win32.basename(entry)}`)
    const bytes = Buffer.from(command('7z', ['e', '-so', filename, entry], { encoding: null }))
    checkInstallerNativePayload(path.win32.basename(entry), bytes)
    if (/\.(?:png|bmp|ico|icns)$/i.test(entry)) continue
    const found = new Set([
      ...findPrivacyIssues(bytes.toString('utf8'), privateValues),
      ...findPrivacyIssues(bytes.toString('utf16le'), privateValues),
    ])
    if (found.size)
      throw new Error(
        `Installer payload privacy failed: ${path.win32.basename(entry)} (${[...found].join(', ')})`,
      )
  }
  const installer = readFileSync(filename)
  const stubIssues = new Set([
    ...findPrivacyIssues(installer.toString('utf8'), privateValues),
    ...findPrivacyIssues(installer.toString('utf16le'), privateValues),
  ])
  if (stubIssues.size)
    throw new Error(`Installer stub privacy failed: ${[...stubIssues].join(', ')}`)
  const application = entries.find((entry) => path.win32.basename(entry) === 'app.exe')
  if (!application) throw new Error('Installer has no app.exe payload')
  for (const name of ['LICENSE.md', 'THIRD_PARTY_NOTICES.md']) {
    const entry = entries.find((item) => path.win32.basename(item) === name)
    if (!entry) throw new Error(`Installer is missing ${name}`)
    const payload = Buffer.from(command('7z', ['e', '-so', filename, entry], { encoding: null }))
    if (!payload.equals(readFileSync(name))) throw new Error(`Installer contains stale ${name}`)
  }
  const payload = Buffer.from(
    command('7z', ['e', '-so', filename, application], { encoding: null }),
  )
  checkWindowsArchitecture(payload)
  const temporary = mkdtempSync(path.join('.cache', 'release-exe-'))
  if (path.dirname(path.resolve(temporary)) !== path.resolve('.cache'))
    throw new Error('Unsafe inspection directory')
  try {
    const executable = path.resolve(temporary, 'app.exe')
    const extracted = spawnSync('7z', ['e', '-y', `-o${temporary}`, filename, application], {
      encoding: 'utf8',
    })
    if (extracted.status !== 0) throw new Error('Cannot inspect installer executable metadata')
    const safePath = executable.replace(/'/g, "''")
    const metadata = JSON.parse(
      command('powershell.exe', [
        '-NoProfile',
        '-Command',
        `$item = Get-Item -LiteralPath '${safePath}'; @{version=$item.VersionInfo.ProductVersion;publisher=$item.VersionInfo.CompanyName} | ConvertTo-Json -Compress`,
      ]),
    )
    if (metadata.version !== version || metadata.publisher !== 'folden')
      throw new Error('Installer version/publisher does not match the release contract')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function inspectUnix(filename, version, target, privateValues) {
  const temporary = mkdtempSync(path.join('.cache', 'release-package-'))
  if (path.dirname(path.resolve(temporary)) !== path.resolve('.cache'))
    throw new Error('Unsafe inspection directory')
  let mounted = false
  try {
    if (filename.endsWith('.deb')) {
      if (command('dpkg-deb', ['--field', filename, 'Version']).trim() !== version)
        throw new Error('Debian package version mismatch')
      if (command('dpkg-deb', ['--field', filename, 'Architecture']).trim() !== 'amd64')
        throw new Error('Debian package architecture mismatch')
      command('dpkg-deb', ['--extract', filename, temporary])
    } else if (filename.endsWith('.AppImage')) {
      chmodSync(filename, 0o755)
      command(path.resolve(filename), ['--appimage-extract'], { cwd: path.resolve(temporary) })
    } else {
      command(
        'hdiutil',
        ['attach', '-readonly', '-nobrowse', '-mountpoint', path.resolve(temporary), filename],
        { input: 'Y\n' }, // The generated DMG presents our own bundled LICENSE.md.
      )
      mounted = true
      const application = readdirSync(temporary).find((name) => name === 'Folden.app')
      if (!application) throw new Error('Disk image has no Folden.app')
      const plist = path.join(temporary, application, 'Contents', 'Info.plist')
      const actual = command('plutil', [
        '-extract',
        'CFBundleShortVersionString',
        'raw',
        '-o',
        '-',
        plist,
      ]).trim()
      if (actual !== version) throw new Error('macOS package version mismatch')
      const executable = command('plutil', [
        '-extract',
        'CFBundleExecutable',
        'raw',
        '-o',
        '-',
        plist,
      ]).trim()
      const architecture = command('lipo', [
        '-archs',
        path.join(temporary, application, 'Contents', 'MacOS', executable),
      ]).trim()
      if (architecture !== (target.startsWith('aarch64') ? 'arm64' : 'x86_64'))
        throw new Error('macOS package architecture mismatch')
      command('codesign', ['--verify', '--deep', '--strict', path.join(temporary, application)])
      const signature = spawnSync(
        'codesign',
        ['-dv', '--verbose=4', path.join(temporary, application)],
        { encoding: 'utf8' },
      )
      if (
        signature.status !== 0 ||
        !signature.stderr.includes('Signature=adhoc') ||
        !signature.stderr.includes('Identifier=com.folden.editor')
      ) {
        throw new Error('macOS signature/identifier does not match the release contract')
      }
    }
    const files = walkFiles(temporary)
    if (!filename.endsWith('.dmg')) {
      const executable = files.find(
        (file) => path.basename(file) === 'app' && file.split(path.sep).includes('bin'),
      )
      if (!executable) throw new Error('Linux package is missing the application executable')
      const bytes = readFileSync(executable)
      if (
        bytes.length < 20 ||
        bytes.toString('ascii', 1, 4) !== 'ELF' ||
        bytes[4] !== 2 ||
        bytes.readUInt16LE(18) !== 62
      )
        throw new Error('Linux package executable is not ELF x64')
      const built = readFileSync(path.join('build', 'desktop', target, 'release', 'app'))
      if (!bytes.equals(built))
        throw new Error(
          'Linux package contains a different executable from the current version-checked release build',
        )
      if (filename.endsWith('.AppImage')) auditNativeComponents(temporary, filename, executable)
    }
    verifyResources(files, privateValues)
  } finally {
    if (mounted) command('hdiutil', ['detach', path.resolve(temporary)])
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv[process.argv.indexOf('--target') + 1]
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  const directory = path.join('build', 'desktop', target, 'release', 'bundle')
  mkdirSync('.cache', { recursive: true })
  const packages = selectPackages(walkFiles(directory), version, target)
  const privateValues = privateGitValues()
  for (const filename of packages) {
    if (target.endsWith('windows-msvc')) inspectWindows(filename, version, privateValues)
    else inspectUnix(filename, version, target, privateValues)
  }
  const destination = path.join('build', 'release', target)
  if (path.dirname(path.resolve(destination)) !== path.resolve('build', 'release'))
    throw new Error('Unsafe release output directory')
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  const files = []
  for (const filename of packages) {
    const extension = releaseFormats[target].find((item) => filename.endsWith(item))
    const output = path.join(
      destination,
      stagedPackageNames(version, target).find((name) => name.endsWith(extension)),
    )
    copyFileSync(filename, output)
    files.push(output)
  }
  for (const name of ['LICENSE.md', 'THIRD_PARTY_NOTICES.md']) {
    const output = path.join(destination, name)
    copyFileSync(name, output)
    files.push(output)
  }
  for (const name of additionalReleaseFiles(target)) {
    const output = path.join(destination, name)
    const source = target.includes('linux')
      ? path.join('.cache', 'native-package-audit', name)
      : await distributionSource(
          nativeDistributions.find((item) => item.sourceArchiveFilename === name),
        )
    copyFileSync(source, output)
    files.push(output)
  }
  writeFileSync(path.join(destination, 'SHA256SUMS.txt'), checksumLines(files))
  console.log(
    `Verified ${packages.length} final package(s) for ${target}; release files: ${destination}`,
  )
}
