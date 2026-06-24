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
  detached: true,
  stdio: 'ignore',
})

child.unref()
