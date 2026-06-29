import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const appPath = path.join(
  rootDir,
  'build',
  'desktop',
  'release',
  process.platform === 'win32' ? 'app.exe' : 'app',
)

if (!existsSync(appPath)) {
  console.error('Built app was not found. Run npm run app:build first.')
  process.exit(1)
}

const child = spawn(appPath, [], {
  cwd: rootDir,
  stdio: 'inherit',
})

function stopChild() {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  child.kill()
}

process.on('SIGINT', () => {
  stopChild()
})

process.on('SIGTERM', () => {
  stopChild()
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(`Could not run built app: ${error.message}`)
  process.exit(1)
})
