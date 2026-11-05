import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePairingOffer } from '../shared/remote-runtime/pairing/pairing'
import { PAIRING_OFFER_VERSION } from '../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import { parseHostAccessLink } from '../shared/remote-runtime/pairing/remote-pairing-address'
import { listEnvironments } from '../shared/remote-runtime/host-store/runtime-environment-store'
import { channelFixture } from '../shared/project-channels.test-fixture'
import { ShamuPrimaryConnection } from './shamu-primary-connection'

const mocks = vi.hoisted(() => ({ verify: vi.fn(), publish: vi.fn() }))
vi.mock('./ipc/runtime-environments/runtime-environment-pairing-verification', () => ({
  verifyRuntimeEnvironmentPairingCode: mocks.verify
}))
vi.mock('./ipc/runtime-environments/runtime-environment-verified-pairing-publish', () => ({
  publishVerifiedPairing: mocks.publish
}))
vi.mock('./ipc/runtime-environments/runtime-environments', () => ({
  invalidateRuntimeEnvironmentTransport: vi.fn()
}))
vi.mock('./ipc/runtime-environments/runtime-environment-transport-routing', () => ({
  callRuntimeEnvironment: vi.fn()
}))

function link(key = 1, endpoint = 'ws://127.0.0.1:12345'): string {
  return encodePairingOffer({
    v: PAIRING_OFFER_VERSION,
    endpoint,
    publicKeyB64: Buffer.alloc(32, key).toString('base64'),
    deviceToken: 'disposable-shamu-test-credential',
    scope: 'runtime'
  })
}

describe('Shamu primary authority', () => {
  let directory: string
  let connection: ShamuPrimaryConnection
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shamu-primary-'))
    connection = new ShamuPrimaryConnection(directory, directory)
    mocks.verify.mockReset()
    mocks.publish.mockReset()
    mocks.verify.mockImplementation(async (code: string) => {
      const parsed = parseHostAccessLink(code)
      if (!parsed.ok) {
        throw new Error('Bad fixture link')
      }
      return { ok: true, link: parsed.value, runtimeStatus: { runtimeId: 'primary-runtime' } }
    })
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('keeps a verified primary across restarts without copying session or provider data', async () => {
    expect(await connection.read()).toEqual({ environmentId: null })
    const result = await connection.connect(link())
    expect(await new ShamuPrimaryConnection(directory, directory).read()).toEqual(result)
    expect(listEnvironments(directory)).toHaveLength(1)
    expect(mocks.verify).toHaveBeenCalledOnce()
    const file = join(directory, 'shamu-primary.json')
    expect(await readFile(file, 'utf8')).not.toContain('disposable-shamu-test-credential')
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
  })

  it('refuses malformed or non-local links before contacting or saving a server', async () => {
    await expect(connection.connect('not a link')).rejects.toThrow('this computer')
    await expect(connection.connect(link(1, 'ws://192.0.2.1:12345'))).rejects.toThrow(
      'this computer'
    )
    await expect(connection.connect(link(1, 'wss://127.attacker.example:443'))).rejects.toThrow(
      'this computer'
    )
    await expect(connection.connect(link(1, 'ws://localhost:12345'))).rejects.toThrow(
      'this computer'
    )
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(await connection.read()).toEqual({ environmentId: null })
    expect(listEnvironments(directory)).toEqual([])
  })

  it('does not replace a working primary with another server or an expired access link', async () => {
    const saved = await connection.connect(link())
    const before = await readFile(join(directory, 'shamu-primary.json'), 'utf8')
    await expect(connection.connect(link(2))).rejects.toThrow('different Orca')
    mocks.verify.mockResolvedValue({ ok: false, kind: 'access-link-invalid' })
    await expect(connection.connect(link())).rejects.toThrow('new access link')
    expect(await connection.read()).toEqual(saved)
    expect(await readFile(join(directory, 'shamu-primary.json'), 'utf8')).toBe(before)
  })

  it('allows project controls only for sessions belonging to the bound primary', async () => {
    const { environmentId } = await connection.connect(link())
    const channel = channelFixture()
    const snapshot = { version: 1 as const, revision: 0, channels: [channel] }
    await expect(connection.assertChannelAuthority(snapshot)).rejects.toThrow('primary Orca')
    channel.members.forEach((member) => {
      member.target = { kind: 'environment', environmentId }
    })
    await expect(connection.assertChannelAuthority(snapshot)).resolves.toBeUndefined()
    channel.members[0].target = { kind: 'environment', environmentId: 'another-runtime' }
    await expect(connection.assertChannelAuthority(snapshot)).rejects.toThrow('primary Orca')
  })

  it('preserves an unreadable binding and refuses to silently establish another authority', async () => {
    const file = join(directory, 'shamu-primary.json')
    await writeFile(file, '{broken')
    await expect(connection.read()).rejects.toThrow()
    await expect(connection.connect(link())).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('{broken')
    expect(mocks.verify).not.toHaveBeenCalled()
  })
})
