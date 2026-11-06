import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VaultFile } from './vault-file'
import { VaultStore } from './vault-store'
import { vaultFixture, vaultAccess, TEST_ENTRY, TEST_PASSWORD } from './vault-fixture.test-support'

describe('Vault protection and session boundaries', () => {
  let fixture: ReturnType<typeof vaultFixture>
  beforeEach(() => {
    fixture = vaultFixture()
  })
  afterEach(() => fixture.dispose())

  it('persists only encrypted metadata and credentials and requires the master password to reopen', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const saved = fixture.store.save(vaultAccess(created), TEST_ENTRY)
    const disk = readFileSync(fixture.file.file, 'utf8')
    for (const value of [TEST_PASSWORD, TEST_ENTRY.name, TEST_ENTRY.username, TEST_ENTRY.secret]) {
      expect(disk.includes(value)).toBe(false)
    }
    expect('secret' in saved.entries[0]).toBe(false)
    fixture.store.lock()
    expect(fixture.store.status('alpha')).toMatchObject({
      state: 'locked',
      session: null,
      entries: []
    })
    await expect(fixture.store.unlock('alpha', 'wrong synthetic master password')).rejects.toThrow(
      'Could not unlock'
    )
    expect(readFileSync(fixture.file.file, 'utf8')).toBe(disk)
    const reopened = await fixture.store.unlock('alpha', TEST_PASSWORD)
    expect(reopened.entries[0].name).toBe('Synthetic service')
    expect(
      fixture.store.useSecret(vaultAccess(reopened), saved.entries[0].id, (bytes) =>
        bytes.toString()
      )
    ).toBe(TEST_ENTRY.secret)
  })

  it('rejects other bots, stale writes and credentials not granted to agents', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const saved = fixture.store.save(vaultAccess(created), { ...TEST_ENTRY, allowAgent: false })
    const id = saved.entries[0].id
    expect(fixture.store.status('beta').entries).toEqual([])
    expect(() => fixture.store.useSecret(vaultAccess(saved, 'beta'), id, () => true)).toThrow(
      'not available'
    )
    expect(() => fixture.store.useSecret(vaultAccess(saved), id, () => true, true)).toThrow(
      'not available'
    )
    expect(() => fixture.store.save(vaultAccess(created), { ...TEST_ENTRY, id })).toThrow(
      'Vault changed'
    )
    const edited = fixture.store.save(vaultAccess(saved), {
      ...TEST_ENTRY,
      id,
      secret: undefined,
      name: 'Renamed synthetic service'
    })
    expect(fixture.store.useSecret(vaultAccess(edited), id, (bytes) => bytes.toString())).toBe(
      TEST_ENTRY.secret
    )
  })

  it('does not create or replace data with an unavailable or weak OS backend', async () => {
    fixture.protection.describeProtectionGap = () => 'basic_text'
    await expect(fixture.store.create('alpha', TEST_PASSWORD)).rejects.toThrow('OS keychain')
    expect(fixture.file.read()).toBeNull()
    fixture.protection.describeProtectionGap = () => null
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    fixture.store.save(vaultAccess(created), TEST_ENTRY)
    const disk = readFileSync(fixture.file.file, 'utf8')
    fixture.protection.isEncryptionAvailable = () => false
    expect(fixture.store.status('alpha')).toMatchObject({
      state: 'unavailable',
      entries: [],
      session: null
    })
    expect(readFileSync(fixture.file.file, 'utf8')).toBe(disk)
  })

  it('refuses altered ciphertext, swapped credentials and an encrypted file copied to another profile', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const first = fixture.store.save(vaultAccess(created), TEST_ENTRY)
    const second = fixture.store.save(vaultAccess(first), {
      ...TEST_ENTRY,
      name: 'Second service',
      secret: 'second synthetic value'
    })
    fixture.store.lock()
    const original = fixture.file.read()!
    const swapped = structuredClone(original.envelope)
    const [a, b] = second.entries
    ;[swapped.secrets[a.id], swapped.secrets[b.id]] = [swapped.secrets[b.id], swapped.secrets[a.id]]
    fixture.file.write(swapped, original.fingerprint)
    const reopened = await fixture.store.unlock('alpha', TEST_PASSWORD)
    expect(() => fixture.store.useSecret(vaultAccess(reopened), a.id, () => true)).toThrow(
      'authentication failed'
    )
    fixture.store.lock()
    const altered = fixture.file.read()!
    const bytes = Buffer.from(altered.envelope.index, 'base64')
    bytes[bytes.length - 1] ^= 1
    altered.envelope.index = bytes.toString('base64')
    fixture.file.write(altered.envelope, altered.fingerprint)
    const disk = readFileSync(fixture.file.file)
    await expect(fixture.store.unlock('alpha', TEST_PASSWORD)).rejects.toThrow(
      'authenticate Vault contents'
    )
    expect(readFileSync(fixture.file.file).equals(disk)).toBe(true)
    const other = join(fixture.directory, 'other-profile')
    mkdirSync(other, { mode: 0o700 })
    mkdirSync(join(other, 'shamu-vault'), { mode: 0o700 })
    copyFileSync(fixture.file.file, join(other, 'shamu-vault', 'vault.json'))
    chmodSync(join(other, 'shamu-vault', 'vault.json'), 0o600)
    const moved = new VaultStore(
      new VaultFile(other),
      () => {},
      () => true,
      () => fixture.protection
    )
    await expect(moved.unlock('alpha', TEST_PASSWORD)).rejects.toThrow('Could not unlock')
  })

  it('invalidates creation, unlock and already admitted work when a lock intervenes', async () => {
    const creating = fixture.store.create('alpha', TEST_PASSWORD)
    fixture.store.lock()
    await expect(creating).rejects.toThrow('cancelled')
    expect(fixture.file.read()).toBeNull()
    await fixture.store.create('alpha', TEST_PASSWORD)
    fixture.store.lock()
    const unlocking = fixture.store.unlock('alpha', TEST_PASSWORD)
    const admitted = fixture.store.admit()
    fixture.store.lock()
    expect(admitted).toThrow('cancelled')
    await expect(unlocking).rejects.toThrow()
    expect(fixture.store.status('alpha').state).toBe('locked')
  })

  it('changes only the key wrapping and rejects the old master password', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    const saved = fixture.store.save(vaultAccess(created), TEST_ENTRY)
    const before = fixture.file.read()!.envelope.secrets
    await fixture.store.changePassphrase(
      vaultAccess(saved),
      TEST_PASSWORD,
      'a different synthetic master password'
    )
    expect(fixture.store.status('alpha').state).toBe('locked')
    expect(fixture.file.read()!.envelope.secrets).toEqual(before)
    await expect(fixture.store.unlock('alpha', TEST_PASSWORD)).rejects.toThrow('Could not unlock')
    const reopened = await fixture.store.unlock('alpha', 'a different synthetic master password')
    expect(
      fixture.store.useSecret(vaultAccess(reopened), saved.entries[0].id, (bytes) =>
        bytes.toString()
      )
    ).toBe(TEST_ENTRY.secret)
  })

  it('locks rather than overwriting a file changed externally', async () => {
    const created = await fixture.store.create('alpha', TEST_PASSWORD)
    writeFileSync(fixture.file.file, '{corrupted', { mode: 0o600 })
    expect(() => fixture.store.save(vaultAccess(created), TEST_ENTRY)).toThrow('Vault changed')
    expect(readFileSync(fixture.file.file, 'utf8')).toBe('{corrupted')
  })

  it.skipIf(process.platform === 'win32')('refuses a linked vault directory', async () => {
    const outside = join(fixture.directory, 'outside')
    mkdirSync(outside, { mode: 0o700 })
    symlinkSync(outside, join(fixture.directory, 'shamu-vault'))
    expect(() => fixture.file.read()).toThrow('opened safely')
  })

  it.skipIf(process.platform === 'win32')(
    'locks and refuses files whose permissions became public',
    async () => {
      await fixture.store.create('alpha', TEST_PASSWORD)
      chmodSync(fixture.file.file, 0o644)
      expect(() => fixture.store.status('alpha')).toThrow('Vault changed or its protection')
      chmodSync(fixture.file.file, 0o600)
      expect(fixture.store.status('alpha').state).toBe('locked')
    }
  )
})
