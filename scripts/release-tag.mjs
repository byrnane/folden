import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = process.env.RELEASE_TAG
if (process.env.RELEASE_CANDIDATE !== 'true') {
  if (tag !== `v${version}` || !/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error('Release tag must exactly match the package version.')
  const result = spawnSync('git', ['tag', '--points-at', 'HEAD'], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout.trim().split('\n').includes(tag))
    throw new Error('Checkout must point to the existing release tag.')
}
const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
const commit = result.stdout.trim()
if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(commit))
  throw new Error('Cannot resolve the tested commit')
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ncommit=${commit}\n`)
console.log(`Validated immutable release candidate ${commit}`)
