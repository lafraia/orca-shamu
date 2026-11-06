import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'vitest'
import { shamuUnreleasedTemplate } from './shamu-changelog.mjs'

function fixture(
  t,
  changes = '- Preserve the reviewed bot changes. [PR #12](https://github.com/lafraia/orca-shamu/pull/12)'
) {
  const root = mkdtempSync(join(tmpdir(), 'shamu-release-test-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  git('init', '-q')
  git('symbolic-ref', 'HEAD', 'refs/heads/main')
  git('config', 'user.name', 'Shamu fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  const packageFile = join(root, 'package.json')
  writeFileSync(packageFile, JSON.stringify({ version: '1.4.248' }))
  git('add', 'package.json')
  git('commit', '-qm', 'Initial upstream release')
  git('tag', 'v1.4.248')
  const upstream = {
    repository: 'stablyai/orca',
    tag: 'v1.4.248',
    commit: git('rev-parse', 'HEAD')
  }
  mkdirSync(join(root, 'config/scripts'), { recursive: true })
  for (const name of ['shamu-release.mjs', 'shamu-changelog.mjs']) {
    copyFileSync(resolve(import.meta.dirname, name), join(root, 'config/scripts', name))
  }
  copyFileSync(
    resolve(import.meta.dirname, '../shamu-release.cjs'),
    join(root, 'config/shamu-release.cjs')
  )
  const metadataFile = join(root, 'config/shamu-release.json')
  writeFileSync(metadataFile, `${JSON.stringify({ upstream, revision: 11 }, null, 2)}\n`)
  const changelogFile = join(root, 'SHAMU_CHANGELOG.md')
  writeFileSync(
    changelogFile,
    `# Shamu changelog\n\n${shamuUnreleasedTemplate(upstream).replace('### Shamu changes', `### Shamu changes\n\n${changes}`)}## Local preview history\n\nKeep historical tags intact.\n`
  )
  const snapshot = () => ({
    metadata: readFileSync(metadataFile, 'utf8'),
    changelog: readFileSync(changelogFile, 'utf8'),
    tags: git('tag', '--list')
  })
  const run = (...args) =>
    spawnSync(process.execPath, [join(root, 'config/scripts/shamu-release.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8'
    })
  return { root, git, run, upstream, packageFile, metadataFile, changelogFile, snapshot }
}

test('show and check preserve metadata, notes and tags during continuous development', (t) => {
  const repo = fixture(t)
  const before = repo.snapshot()
  for (const command of ['show', 'check']) {
    const result = repo.run(command)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).version, '1.4.248-shamu.11')
  }
  assert.deepEqual(repo.snapshot(), before)
})

test('ordinary bump and unclosed release notes are refused without any writes', (t) => {
  const repo = fixture(t)
  const before = repo.snapshot()
  const bump = repo.run('bump')
  assert.notEqual(bump.status, 0)
  assert.match(bump.stderr, /explicit user request/)
  const notes = repo.run('notes')
  assert.notEqual(notes.status, 0)
  assert.match(notes.stderr, /no closed Shamu changelog entry/)
  assert.deepEqual(repo.snapshot(), before)
})

test('explicit closing groups reviewed changes into one matching version without creating tags', (t) => {
  const repo = fixture(t)
  const result = repo.run('bump', '--close-release')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).version, '1.4.248-shamu.12')
  const metadata = JSON.parse(readFileSync(repo.metadataFile, 'utf8'))
  assert.equal(metadata.revision, 12)
  assert.deepEqual(metadata.upstream, repo.upstream)
  const changelog = readFileSync(repo.changelogFile, 'utf8')
  assert.match(changelog, /## 1\.4\.248-shamu\.12 \(\d{4}-\d{2}-\d{2}\)/)
  assert.equal(
    changelog
      .slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## 1.4.248-shamu.12'))
      .includes('PR #12'),
    false
  )
  const notes = repo.run('notes')
  assert.equal(notes.status, 0, notes.stderr)
  assert.match(notes.stdout, /PR #12/)
  assert.match(notes.stdout, /Upstream: `1\.4\.248`/)
  assert.equal(notes.stdout.includes('Local preview history'), false)
  assert.equal(repo.git('tag', '--list'), 'v1.4.248')
})

test('upstream sync records the exact merged release and retains pending Shamu changes', (t) => {
  const repo = fixture(t)
  writeFileSync(repo.packageFile, JSON.stringify({ version: '1.4.249' }))
  repo.git('add', 'package.json')
  repo.git('commit', '-qm', 'Import next upstream release')
  repo.git('tag', 'v1.4.249')
  const commit = repo.git('rev-parse', 'HEAD')
  const result = repo.run('sync')
  assert.equal(result.status, 0, result.stderr)
  const release = JSON.parse(result.stdout)
  assert.equal(release.version, '1.4.249-shamu.1')
  assert.equal(release.upstream.commit, commit)
  const changelog = readFileSync(repo.changelogFile, 'utf8')
  assert.match(changelog, /Upstream: `1\.4\.249`/)
  assert.ok(changelog.includes(commit))
  assert.ok(changelog.includes('v1.4.248...v1.4.249'))
  assert.ok(changelog.includes('PR #12'))
  assert.equal(repo.run('check').status, 0)
  assert.equal(repo.git('tag', '--list', 'shamu/*'), '')
})

test('changing a version number without merging that upstream release cannot update the pin', (t) => {
  const repo = fixture(t)
  const before = repo.snapshot()
  repo.git('checkout', '--orphan', 'unmerged-upstream')
  writeFileSync(repo.packageFile, JSON.stringify({ version: '1.4.249' }))
  repo.git('add', 'package.json')
  repo.git('commit', '-qm', 'Unmerged upstream release')
  repo.git('tag', 'v1.4.249')
  repo.git('checkout', 'main')
  writeFileSync(repo.packageFile, JSON.stringify({ version: '1.4.249' }))
  const result = repo.run('sync')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Merge upstream v1\.4\.249/)
  assert.equal(readFileSync(repo.metadataFile, 'utf8'), before.metadata)
  assert.equal(readFileSync(repo.changelogFile, 'utf8'), before.changelog)
})

test('historical preview tags cannot be reused for a different distribution', (t) => {
  const repo = fixture(t)
  repo.git('tag', 'shamu/v1.4.248-shamu.12')
  const before = repo.snapshot()
  const result = repo.run('bump', '--close-release')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /already exists/)
  assert.deepEqual(repo.snapshot(), before)
})

test('empty releases and mismatched changelog bases are rejected without edits', (t) => {
  const repo = fixture(t, '')
  const before = repo.snapshot()
  const empty = repo.run('bump', '--close-release')
  assert.notEqual(empty.status, 0)
  assert.match(empty.stderr, /Add the included changes/)
  assert.deepEqual(repo.snapshot(), before)
  writeFileSync(
    repo.changelogFile,
    before.changelog.replace('Upstream: `1.4.248`', 'Upstream: `1.4.999`')
  )
  const mismatched = repo.snapshot()
  const check = repo.run('check')
  assert.notEqual(check.status, 0)
  assert.match(check.stderr, /must match the exact pinned upstream/)
  assert.deepEqual(repo.snapshot(), mismatched)
})
