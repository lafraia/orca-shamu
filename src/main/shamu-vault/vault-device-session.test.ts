import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VaultStore } from './vault-store'
import { vaultFixture, vaultAccess, TEST_ENTRY, TEST_PASSWORD } from './vault-fixture.test-support'

describe('Vault device sessions', () => {
  let open: boolean
  let fixture: ReturnType<typeof vaultFixture>
  beforeEach(() => {
    open = true
    fixture = vaultFixture(() => open)
  })
  afterEach(() => fixture.dispose())

  it('reopens through the OS keychain in a fresh Shamu session without retaining the master password', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const saved = fixture.store.save(vaultAccess(created), TEST_ENTRY)
    fixture.store.lock()
    const restarted = new VaultStore(
      fixture.file,
      () => {},
      () => open,
      () => fixture.protection,
      fixture.now
    )
    try {
      await restarted.unlockDevice()
      const snapshot = restarted.status('alpha')
      expect(snapshot).toMatchObject({ state: 'unlocked', automaticUnlock: true })
      expect(
        restarted.useSecret(vaultAccess(snapshot), saved.entries[0].id, (bytes) => bytes.toString())
      ).toBe(TEST_ENTRY.secret)
      expect(readFileSync(fixture.file.file, 'utf8').includes(TEST_PASSWORD)).toBe(false)
    } finally {
      restarted.lock()
    }
  })

  it('blocks decryption, mutations and old access tokens while Shamu is closed', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const saved = fixture.store.save(vaultAccess(created), TEST_ENTRY)
    open = false
    expect(fixture.store.status('alpha')).toMatchObject({
      state: 'locked',
      session: null,
      entries: []
    })
    expect(() =>
      fixture.store.useSecret(vaultAccess(saved), saved.entries[0].id, () => true)
    ).toThrow('Open Orca Shamu')
    await expect(fixture.store.unlockDevice()).rejects.toThrow('Open Orca Shamu')
    await expect(fixture.store.unlock('alpha', TEST_PASSWORD)).rejects.toThrow('Open Orca Shamu')
    open = true
    await fixture.store.unlockDevice()
    expect(() => fixture.store.save(vaultAccess(saved), TEST_ENTRY)).toThrow('Vault is locked')
  })

  it('does not expose a key whose automatic opening completed after Shamu closed', async () => {
    await fixture.store.create('alpha', TEST_PASSWORD)
    fixture.store.lock()
    const opening = fixture.store.unlockDevice()
    open = false
    fixture.store.lock()
    await expect(opening).rejects.toThrow('cancelled')
    open = true
    expect(fixture.store.status('alpha').state).toBe('locked')
  })

  it('enrolls a legacy vault only after its master password is verified', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    fixture.store.save(vaultAccess(created), TEST_ENTRY)
    fixture.store.lock()
    const persisted = fixture.file.read()!
    delete persisted.envelope.deviceKey
    fixture.file.write(persisted.envelope, persisted.fingerprint)
    const before = readFileSync(fixture.file.file, 'utf8')
    await fixture.store.unlockDevice()
    expect(fixture.store.status('alpha')).toMatchObject({ state: 'locked', automaticUnlock: false })
    expect(readFileSync(fixture.file.file, 'utf8')).toBe(before)
    await expect(fixture.store.unlock('alpha', 'wrong synthetic password')).rejects.toThrow(
      'Could not unlock'
    )
    expect(readFileSync(fixture.file.file, 'utf8')).toBe(before)
    const reopened = await fixture.store.unlock('alpha', TEST_PASSWORD)
    expect(reopened).toMatchObject({ state: 'unlocked', automaticUnlock: true })
    fixture.store.lock()
    await fixture.store.unlockDevice()
    expect(fixture.store.status('alpha').entries[0].name).toBe('Synthetic service')
  })

  it('fails closed on a swapped device key or unavailable keychain without rewriting data', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    fixture.store.save(vaultAccess(created), TEST_ENTRY)
    fixture.store.lock()
    const another = vaultFixture()
    try {
      const second = new VaultStore(
        another.file,
        () => {},
        () => true,
        () => fixture.protection
      )
      await second.create('alpha', 'another synthetic master password')
      second.lock()
      const current = fixture.file.read()!
      current.envelope.deviceKey = another.file.read()!.envelope.deviceKey
      fixture.file.write(current.envelope, current.fingerprint)
      const before = readFileSync(fixture.file.file, 'utf8')
      await expect(fixture.store.unlockDevice()).rejects.toThrow(
        'Automatic Vault unlock is unavailable'
      )
      expect(readFileSync(fixture.file.file, 'utf8')).toBe(before)
      fixture.protection.isEncryptionAvailable = () => false
      await expect(fixture.store.unlockDevice()).rejects.toThrow('OS keychain')
      expect(fixture.store.status('alpha')).toMatchObject({ state: 'unavailable', entries: [] })
    } finally {
      another.dispose()
    }
  })
})
