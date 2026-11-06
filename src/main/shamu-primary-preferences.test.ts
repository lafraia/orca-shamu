import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import {
  readShamuPrimaryPreferences,
  selectShamuInterfacePreferences
} from './shamu-primary-preferences'

const mocks = vi.hoisted(() => ({ metadata: vi.fn(), read: vi.fn() }))
vi.mock('../cli/runtime/metadata', () => ({ tryReadMetadata: mocks.metadata }))
vi.mock('./persistence/profile-state/profile-state-domain-reader', () => ({
  readProfileStateDomain: mocks.read
}))
let directory: string
beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'shamu-preferences-'))
  mocks.metadata.mockReturnValue({ runtimeId: 'primary' })
  mocks.read.mockReturnValue({ kind: 'value', value: { theme: 'dark', terminalFontSize: 12 } })
  await writeFile(
    join(directory, 'orca-profile-index.json'),
    JSON.stringify({ activeProfileId: 'local-default' })
  )
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it('imports visual preferences from the active primary profile without credentials or execution settings', async () => {
  const selected = selectShamuInterfacePreferences(
    {
      terminalFontSize: 12,
      nativeChatAppearance: { fontFamily: 'SF Mono' },
      agentDefaultEnv: { codex: { SECRET: 'disposable-secret' } },
      activeRuntimeEnvironmentId: 'wrong-host',
      nativeChatPermissionMode: 'full-access',
      floatingTerminalTrustedCwds: ['/private-source']
    },
    directory
  )
  expect(selected).toMatchObject({
    terminalFontSize: 12,
    nativeChatAppearance: { fontFamily: 'SF Mono' }
  })
  expect(JSON.stringify(selected)).not.toContain('disposable-secret')
  expect(selected).not.toHaveProperty('activeRuntimeEnvironmentId')
  expect(selected).not.toHaveProperty('nativeChatPermissionMode')
  expect(selected).not.toHaveProperty('floatingTerminalTrustedCwds')
  await expect(readShamuPrimaryPreferences(directory, 'primary', directory)).resolves.toMatchObject(
    { theme: 'dark', terminalFontSize: 12 }
  )
  expect(mocks.read).toHaveBeenCalledWith(
    join(directory, 'profiles/local-default/profile-state.db'),
    'local-default',
    'settings'
  )
})

it('refuses an unrelated local profile before reading its preferences', async () => {
  await expect(
    readShamuPrimaryPreferences(directory, 'another-primary', directory)
  ).rejects.toThrow('does not own')
  expect(mocks.read).not.toHaveBeenCalled()
})

it('rejects profile traversal and unreadable authority instead of falling back to an old export', async () => {
  await writeFile(
    join(directory, 'orca-profile-index.json'),
    JSON.stringify({ activeProfileId: '../elsewhere' })
  )
  await expect(readShamuPrimaryPreferences(directory, 'primary', directory)).rejects.toThrow()
  expect(mocks.read).not.toHaveBeenCalled()
  await writeFile(
    join(directory, 'orca-profile-index.json'),
    JSON.stringify({ activeProfileId: 'local-default' })
  )
  mocks.read.mockReturnValue({ kind: 'unreadable', error: new Error('busy') })
  await expect(readShamuPrimaryPreferences(directory, 'primary', directory)).rejects.toThrow(
    'Could not read'
  )
})
