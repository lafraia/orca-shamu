import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const file = resolve(root, 'config/shamu-release.json')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const current = JSON.parse(readFileSync(file, 'utf8'))
const command = process.argv[2] ?? 'show'
if (!['show', 'sync', 'bump'].includes(command)) {
  throw new Error('Usage: pnpm shamu:version [show|sync|bump]')
}
if (command !== 'show') {
  const tag = `v${pkg.version}`
  const commit = execFileSync('git', ['rev-parse', '--verify', `${tag}^{commit}`], {
    cwd: root,
    encoding: 'utf8'
  }).trim()
  const upstreamPackage = JSON.parse(
    execFileSync('git', ['show', `${commit}:package.json`], { cwd: root, encoding: 'utf8' })
  )
  if (upstreamPackage.version !== pkg.version) {
    throw new Error('The upstream tag and package version disagree.')
  }
  if (command === 'bump' && (current.upstream.tag !== tag || current.upstream.commit !== commit)) {
    throw new Error('Run sync before bumping a new upstream release.')
  }
  const revision =
    command === 'bump'
      ? current.revision + 1
      : current.upstream.commit === commit
        ? current.revision
        : 1
  writeFileSync(
    file,
    `${JSON.stringify({ upstream: { repository: 'stablyai/orca', tag, commit }, revision }, null, 2)}\n`
  )
}
const release = createRequire(import.meta.url)('../shamu-release.cjs')
process.stdout.write(`${JSON.stringify(release, null, 2)}\n`)
