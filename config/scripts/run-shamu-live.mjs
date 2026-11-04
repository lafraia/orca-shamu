import { spawnProcess } from '@orca/process-host'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createShamuLiveServer } from './shamu-live-server.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: pnpm dev:shamu [--app /path/to/Shamu/executable]')
  console.log(
    'Close Shamu first. React and CSS changes reload locally; main and preload stay packaged.'
  )
  process.exit(0)
}
const executable =
  args.length === 2 && args[0] === '--app'
    ? resolve(args[1])
    : args.length === 0 && process.platform === 'darwin'
      ? '/Applications/Orca Shamu.app/Contents/MacOS/Orca'
      : null
if (!executable || !existsSync(executable)) {
  throw new Error('Pass --app with the installed Orca Shamu executable.')
}
process.env.NODE_ENV = 'development'
process.env.NODE_ENV_ELECTRON_VITE = 'development'
const live = await createShamuLiveServer({ repoRoot })
const stateFile = resolve(repoRoot, 'out', 'shamu-live.json')
mkdirSync(dirname(stateFile), { recursive: true })
writeFileSync(stateFile, JSON.stringify({ pid: process.pid, url: live.url, repoRoot }), {
  mode: 0o600
})
console.log(`[shamu-live] Renderer: ${live.url}`)
console.log(
  '[shamu-live] Save frontend files to update Shamu. The primary Orca keeps its sessions.'
)

const childEnv = { ...process.env, ...live.env }
delete childEnv.ELECTRON_RUN_AS_NODE
delete childEnv.ELECTRON_RENDERER_URL
const child = spawnProcess({
  program: executable,
  args: [],
  cwd: repoRoot,
  env: childEnv,
  stdio: 'inherit'
})
let stopping = false
async function stop(signal) {
  if (stopping) {
    return
  }
  stopping = true
  if (signal && child.exitCode === null) {
    child.kill(signal)
  }
  await live.server.close()
  rmSync(stateFile, { force: true })
}
child.once('error', async () => {
  console.error('[shamu-live] Could not start Shamu.')
  process.exitCode = 1
  await stop()
})
child.once('exit', async (code) => {
  process.exitCode = code ?? 1
  await stop()
})
process.once('SIGINT', () => void stop('SIGINT'))
process.once('SIGTERM', () => void stop('SIGTERM'))
