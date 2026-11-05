import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import {
  closeShamuChangelog,
  shamuReleaseNotes,
  syncShamuChangelog,
  validateShamuChangelog
} from './shamu-changelog.mjs'

const root = resolve(import.meta.dirname, '../..')
const file = resolve(root, 'config/shamu-release.json')
const changelogFile = resolve(root, 'SHAMU_CHANGELOG.md')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const current = JSON.parse(readFileSync(file, 'utf8'))
const command = process.argv[2] ?? 'show'
const args = process.argv.slice(3)
if (command === 'bump' && args.length === 0) {
  throw new Error(
    'Only close a distribution after an explicit user request. Use bump --close-release for that release preparation.'
  )
}
if (
  !['show', 'sync', 'bump', 'check', 'notes'].includes(command) ||
  (command === 'bump' ? args.length !== 1 || args[0] !== '--close-release' : args.length !== 0)
) {
  throw new Error('Usage: pnpm shamu:version [show|sync|check|notes|bump --close-release]')
}
const require = createRequire(import.meta.url)
if (command !== 'show') {
  if (command !== 'sync') {
    require('../shamu-release.cjs')
  }
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
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: root,
      stdio: 'pipe'
    })
  } catch {
    throw new Error(`Merge upstream ${tag} before updating or distributing Shamu on that base.`)
  }
  if (command !== 'sync' && (current.upstream.tag !== tag || current.upstream.commit !== commit)) {
    throw new Error('Run sync before bumping a new upstream release.')
  }
  const changelog = readFileSync(changelogFile, 'utf8')
  if (command === 'sync' || command === 'bump') {
    const revision =
      command === 'bump'
        ? current.revision + 1
        : current.upstream.commit === commit
          ? current.revision
          : 1
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error('The Shamu revision must be a positive safe integer.')
    }
    const upstream = { repository: 'stablyai/orca', tag, commit }
    let nextChangelog
    if (command === 'bump') {
      const version = `${pkg.version}-shamu.${revision}`
      const releaseTag = `shamu/v${version}`
      try {
        execFileSync('git', ['rev-parse', '--verify', `refs/tags/${releaseTag}`], {
          cwd: root,
          stdio: 'pipe'
        })
        throw new Error(
          `The tag ${releaseTag} already exists. Do not reuse release or preview tags.`
        )
      } catch (error) {
        if (!(error instanceof Error && 'status' in error && error.status === 128)) {
          throw error
        }
      }
      nextChangelog = closeShamuChangelog(
        changelog,
        upstream,
        version,
        new Date().toISOString().slice(0, 10)
      )
    } else {
      nextChangelog = syncShamuChangelog(changelog, current.upstream, upstream)
    }
    if (nextChangelog !== changelog) {
      writeFileSync(changelogFile, nextChangelog)
    }
    const nextMetadata = `${JSON.stringify({ upstream, revision }, null, 2)}\n`
    if (nextMetadata !== readFileSync(file, 'utf8')) {
      writeFileSync(file, nextMetadata)
    }
  } else {
    validateShamuChangelog(changelog, current.upstream)
    if (command === 'notes') {
      const release = require('../shamu-release.cjs')
      process.stdout.write(`${shamuReleaseNotes(changelog, release.upstream, release.version)}\n`)
      process.exit(0)
    }
  }
}
delete require.cache[require.resolve('../shamu-release.cjs')]
delete require.cache[require.resolve('../shamu-release.json')]
const release = require('../shamu-release.cjs')
process.stdout.write(`${JSON.stringify(release, null, 2)}\n`)
