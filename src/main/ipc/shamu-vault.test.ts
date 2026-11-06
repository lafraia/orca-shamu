import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { setSecretStore, _resetSecretStoreForTests } from '../../shared/secret-store'
import type { ProjectChannelsStore } from '../project-channels-store'
import { vaultFixture, TEST_PASSWORD } from '../shamu-vault/vault-fixture.test-support'
import { SHAMU_BOT_METHODS } from '../runtime/rpc/methods/shamu-bots'
import { registerShamuVaultHandlers } from './shamu-vault'
import { emptyProjectChannels } from '../../shared/project-channels'
import { channelFixture } from '../../shared/project-channels.test-fixture'

type VaultMocks = {
  handlers: Map<string, (...args: unknown[]) => unknown>
  trusted: Mock<() => boolean>
  window: unknown
}
const mocks = vi.hoisted((): VaultMocks => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  trusted: vi.fn(() => true),
  window: undefined
}))
vi.mock('./ui', () => ({
  isTrustedUIRenderer: mocks.trusted,
  getTrustedUIRendererWindow: () => mocks.window
}))
vi.mock('electron', () => ({
  app: { on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showMessageBox: vi.fn() },
  ipcMain: {
    removeHandler: (name: string) => mocks.handlers.delete(name),
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(name, handler)
  },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn(), getSystemIdleTime: () => 0 },
  clipboard: { readText: () => '', clear: vi.fn(), writeText: vi.fn() }
}))

describe('Vault transport admission', () => {
  let fixture: ReturnType<typeof vaultFixture>
  let sender: EventEmitter & { mainFrame: object; isDestroyed: () => boolean; send: () => void }
  beforeEach(() => {
    fixture = vaultFixture()
    setSecretStore(fixture.protection)
    mocks.trusted.mockReturnValue(true)
    sender = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      send: () => {}
    })
    mocks.window = Object.assign(new EventEmitter(), {
      webContents: sender,
      isVisible: () => true,
      isMinimized: () => false,
      isDestroyed: () => false
    })
  })
  afterEach(() => {
    fixture.dispose()
    _resetSecretStoreForTests()
  })
  const channels = (): Pick<ProjectChannelsStore, 'read'> => ({
    read: async () => ({
      ...emptyProjectChannels(),
      channels: [
        {
          ...channelFixture(),
          id: 'alpha',
          home: {
            directory: fixture.directory,
            memberId: 'coordinator',
            createOperationId: 'alpha',
            createFingerprint: 'alpha',
            ready: true
          }
        }
      ]
    })
  })
  const invoke = (name: string, frame: unknown, ...args: unknown[]) =>
    mocks.handlers.get(`shamuVault:${name}`)!({ sender, senderFrame: frame }, ...args)

  it('rejects a trusted window subframe and an untrusted renderer before vault access', async () => {
    const service = registerShamuVaultHandlers(fixture.directory, channels())
    try {
      expect(() => invoke('create', {}, 'alpha', TEST_PASSWORD)).toThrow('main Orca Shamu window')
      mocks.trusted.mockReturnValue(false)
      expect(() => invoke('status', sender.mainFrame, 'alpha')).toThrow('main Orca Shamu window')
      expect(fixture.file.read()).toBeNull()
      mocks.trusted.mockReturnValue(true)
      await expect(invoke('status', sender.mainFrame, 'alpha')).resolves.toMatchObject({
        state: 'missing',
        entries: []
      })
    } finally {
      service.dispose()
    }
  })

  it('invalidates a request admitted before a lock while its bot lookup was pending', async () => {
    let release!: (value: Awaited<ReturnType<ProjectChannelsStore['read']>>) => void
    const pendingChannels: Pick<ProjectChannelsStore, 'read'> = {
      read: () =>
        new Promise<Awaited<ReturnType<ProjectChannelsStore['read']>>>((resolve) => {
          release = resolve
        })
    }
    const service = registerShamuVaultHandlers(fixture.directory, pendingChannels)
    try {
      const creation = invoke('create', sender.mainFrame, 'alpha', TEST_PASSWORD)
      invoke('lock', sender.mainFrame)
      release(await channels().read())
      await expect(creation).rejects.toThrow('cancelled')
      expect(fixture.file.read()).toBeNull()
    } finally {
      service.dispose()
    }
  })

  it('rejects paired devices at the runtime RPC boundary', () => {
    const method = SHAMU_BOT_METHODS[0]
    const context: Parameters<typeof method.handler>[1] = {
      caller: { kind: 'paired-device', deviceId: 'synthetic-device' },
      get runtime(): never {
        throw new Error('A paired device must be rejected before runtime access.')
      }
    }
    expect(() => method.handler({ action: 'vault.list', actorId: 'alpha' }, context)).toThrow(
      'local authenticated CLI'
    )
  })
})
