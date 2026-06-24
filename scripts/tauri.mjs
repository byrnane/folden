import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const tauriBin = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

if (!existsSync(tauriBin)) {
  console.error('Tauri CLI was not found. Run npm install first.')
  process.exit(1)
}

const cargoBin = path.join(homedir(), '.cargo', 'bin')
const cargoTargetDir = path.join(rootDir, 'build', 'desktop')
const env = {
  ...process.env,
  CARGO_TARGET_DIR: cargoTargetDir,
  PATH: `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`,
}

const child = spawn(process.execPath, [tauriBin, ...process.argv.slice(2)], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
