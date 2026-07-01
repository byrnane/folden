import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, 'src')
const sourceExtensions = ['.ts', '.vue']
const graph = new Map()

function normalizePath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/')
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath))
      continue
    }

    if (sourceExtensions.includes(path.extname(entry.name))) {
      files.push(entryPath)
    }
  }

  return files
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null
  }

  const basePath = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [
    basePath,
    ...sourceExtensions.map((extension) => `${basePath}${extension}`),
    ...sourceExtensions.map((extension) => path.join(basePath, `index${extension}`)),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null
}

function runtimeImports(content) {
  const imports = []
  const importPattern = /^\s*import\s+(?!type\b)(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm
  const sideEffectImportPattern = /^\s*import\s+['"]([^'"]+)['"]/gm
  const exportPattern = /^\s*export\s+(?!type\b)(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm

  for (const pattern of [importPattern, sideEffectImportPattern, exportPattern]) {
    for (const match of content.matchAll(pattern)) {
      imports.push(match[1])
    }
  }

  return imports
}

for (const file of walkFiles(sourceDir)) {
  const dependencies = runtimeImports(fs.readFileSync(file, 'utf8'))
    .map((specifier) => resolveImport(file, specifier))
    .filter((resolvedFile) => resolvedFile !== null)
    .map((resolvedFile) => normalizePath(resolvedFile))

  graph.set(normalizePath(file), dependencies)
}

const visiting = new Set()
const visited = new Set()
const stack = []
const cycles = []

function visit(file) {
  if (visiting.has(file)) {
    const cycleStart = stack.indexOf(file)
    cycles.push([...stack.slice(cycleStart), file])
    return
  }

  if (visited.has(file)) {
    return
  }

  visiting.add(file)
  stack.push(file)

  for (const dependency of graph.get(file) ?? []) {
    visit(dependency)
  }

  stack.pop()
  visiting.delete(file)
  visited.add(file)
}

for (const file of graph.keys()) {
  visit(file)
}

if (cycles.length) {
  console.error('Dependency cycles detected:')

  for (const cycle of cycles) {
    console.error(`- ${cycle.join(' -> ')}`)
  }

  process.exit(1)
}

console.log(`No dependency cycles detected in ${graph.size} source files.`)
