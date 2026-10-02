import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const bundles = {
  'x86_64-pc-windows-msvc': 'nsis',
  'x86_64-unknown-linux-gnu': 'appimage,deb',
  'x86_64-apple-darwin': 'dmg',
  'aarch64-apple-darwin': 'dmg',
}
const target = process.argv[process.argv.indexOf('--target') + 1]
if (!bundles[target]) throw new Error('Specify one supported release target with --target.')
if (process.env.RUSTFLAGS && !process.env.CARGO_ENCODED_RUSTFLAGS) {
  throw new Error(
    'Use CARGO_ENCODED_RUSTFLAGS for custom release flags; RUSTFLAGS will not be silently discarded.',
  )
}
const prefixes = [
  [homedir(), '/user'],
  [process.cwd(), '/folden'],
  [process.env.CARGO_HOME || path.join(homedir(), '.cargo'), '/cargo'],
  [process.env.RUSTUP_HOME || path.join(homedir(), '.rustup'), '/rustup'],
]
const flags = prefixes.map(
  ([source, replacement]) => `--remap-path-prefix=${source}=${replacement}`,
)
const encoded = [process.env.CARGO_ENCODED_RUSTFLAGS, ...flags].filter(Boolean).join('\x1f')
const result = spawnSync(
  process.execPath,
  [
    'scripts/tauri.mjs',
    'build',
    '--target',
    target,
    '--bundles',
    bundles[target],
    '--',
    '--locked',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, CARGO_ENCODED_RUSTFLAGS: encoded },
  },
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
