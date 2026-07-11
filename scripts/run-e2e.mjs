import { spawn } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const playwrightBin = path.join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js')
const serverUrl = 'http://127.0.0.1:5173/'

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isServerReady(url) {
  return await new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume()
      resolve(Boolean(response.statusCode && response.statusCode < 500))
    })

    request.on('error', () => resolve(false))
    request.setTimeout(2_000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(url, timeoutMs = 120_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const isReady = await isServerReady(url)

    if (isReady) {
      return
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

function spawnNode(scriptPath, args, options = {}) {
  return spawn(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    ...options,
  })
}

async function terminateProcessTree(child) {
  if (!child) {
    return
  }

  if (!child.pid || child.exitCode !== null || child.killed) {
    return
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        cwd: rootDir,
        stdio: 'ignore',
        shell: false,
      })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
    return
  }

  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 1_500))

  if (child.exitCode === null && !child.killed) {
    child.kill('SIGKILL')
  }
}

const shouldReuseExistingServer = await isServerReady(serverUrl)
const viteServer = shouldReuseExistingServer
  ? null
  : spawnNode(viteBin, ['--host', '127.0.0.1', '--strictPort'])
let receivedSignal = null

const forwardSignal = (signal) => {
  receivedSignal = signal
  void terminateProcessTree(viteServer).finally(() => {
    process.kill(process.pid, signal)
  })
}

process.on('SIGINT', forwardSignal)
process.on('SIGTERM', forwardSignal)

try {
  if (viteServer) {
    const viteExitBeforeReady = new Promise((_, reject) => {
      viteServer.once('exit', (code, signal) => {
        reject(
          new Error(
            signal
              ? `Vite dev server exited with signal ${signal} before it became ready.`
              : `Vite dev server exited with code ${code ?? 1} before it became ready.`,
          ),
        )
      })
      viteServer.once('error', reject)
    })

    await Promise.race([waitForServer(serverUrl), viteExitBeforeReady])
  }

  const playwright = spawnNode(playwrightBin, ['test', ...process.argv.slice(2)])
  const exitCode = await new Promise((resolve, reject) => {
    playwright.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright exited with signal ${signal}`))
        return
      }

      resolve(code ?? 1)
    })
    playwright.on('error', reject)
  })

  await terminateProcessTree(viteServer)
  process.exit(Number(exitCode))
} catch (error) {
  await terminateProcessTree(viteServer)

  if (!receivedSignal) {
    console.error(error instanceof Error ? error.message : String(error))
  }

  process.exit(1)
}
