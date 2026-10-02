export const dependencyTargets = {
  'Windows x64': 'x86_64-pc-windows-msvc',
  'Linux x64': 'x86_64-unknown-linux-gnu',
  'macOS x64': 'x86_64-apple-darwin',
  'macOS arm64': 'aarch64-apple-darwin',
}

export const releaseTargets = Object.fromEntries(
  Object.entries(dependencyTargets).filter(([platform]) => platform !== 'Linux x64'),
)

export function classifyCargoGraph(metadata) {
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]))
  const macros = new Set(
    metadata.packages
      .filter((item) => item.targets.some((target) => target.kind.includes('proc-macro')))
      .map((item) => item.id),
  )
  const scopes = new Map()
  const visited = new Set()
  function visit(id, scope) {
    if (macros.has(id)) scope = 'build'
    if (visited.has(`${id}:${scope}`)) return
    visited.add(`${id}:${scope}`)
    if (!scopes.has(id)) scopes.set(id, new Set())
    scopes.get(id).add(scope)
    for (const dependency of nodes.get(id).deps) {
      for (const kind of dependency.dep_kinds) {
        if (kind.kind === 'dev') continue
        visit(dependency.pkg, scope === 'build' || kind.kind === 'build' ? 'build' : 'runtime')
      }
    }
  }
  visit(metadata.resolve.root, 'runtime')
  return scopes
}
