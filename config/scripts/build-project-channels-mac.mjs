import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') {
  throw new Error('This launcher packages the macOS project-channel preview only.')
}
const cwd = resolve(import.meta.dirname, '../..')
const env = {
  ...process.env,
  ORCA_MAC_RELEASE: '0',
  ORCA_MAC_HOURLY: '0',
  ORCA_MAC_DAILY: '0',
  ORCA_MAC_ADHOC: '0',
  CSC_NAME: '-',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-'
}
delete env.CSC_LINK
delete env.CSC_KEY_PASSWORD
const tasks = [
  ['run', 'build:desktop'],
  ['run', 'build:native'],
  ['run', 'ensure:electron-runtime'],
  ['exec', 'electron-builder', '--config', 'config/electron-builder.projects.cjs', '--mac', '--dir']
]
for (const args of tasks) {
  const child = spawnSync('pnpm', args, { cwd, stdio: 'inherit', env })
  if (child.error) {
    throw child.error
  }
  if (child.status !== 0) {
    process.exit(child.status ?? 1)
  }
}
