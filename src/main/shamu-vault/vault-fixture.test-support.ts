import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SecretStore } from '../../shared/secret-store'
import type { VaultSnapshot, VaultAccess } from '../../shared/shamu-vault'
import { sealVaultBytes, openVaultBytes } from './vault-crypto'
import { VaultFile } from './vault-file'
import { VaultStore } from './vault-store'

export const TEST_PASSWORD = 'synthetic master passphrase for vault tests'
export function vaultFixture(ownerIsOpen: () => boolean = () => true) {
  const directory = mkdtempSync(join(tmpdir(), 'shamu-vault-unit-'))
  const osKey = randomBytes(32)
  const protection: SecretStore = {
    isEncryptionAvailable: () => true,
    describeProtectionGap: () => null,
    encryptString: (plain) => Buffer.from(sealVaultBytes(osKey, 'test-os-key', Buffer.from(plain))),
    decryptString: (sealed) => {
      const bytes = openVaultBytes(osKey, 'test-os-key', sealed.toString())
      try {
        return bytes.toString()
      } finally {
        bytes.fill(0)
      }
    }
  }
  const file = new VaultFile(directory)
  let now = 1_800_000_000_000
  const store = new VaultStore(
    file,
    () => {},
    ownerIsOpen,
    () => protection,
    () => now
  )
  return {
    directory,
    file,
    store,
    protection,
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds
    },
    dispose: () => {
      store.lock()
      osKey.fill(0)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
export function vaultAccess(snapshot: VaultSnapshot, botId = 'alpha'): VaultAccess {
  if (!snapshot.session) {
    throw new Error('The synthetic vault must be unlocked.')
  }
  return { botId, session: snapshot.session, revision: snapshot.revision }
}
export const TEST_ENTRY = {
  name: 'Synthetic service',
  username: 'synthetic@example.test',
  website: 'https://example.test',
  secret: 'synthetic-credential-never-used-outside-tests',
  allowAgent: true,
  environmentVariable: 'TEST_API_TOKEN'
}
