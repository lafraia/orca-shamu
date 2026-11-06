import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { z } from 'zod'
import type { SecretStore } from '../../shared/secret-store'

export const vaultEnvelopeSchema = z
  .object({
    format: z.literal('orca-shamu-vault'),
    version: z.literal(1),
    id: z.uuid(),
    kdf: z.literal('scrypt-131072-8-1'),
    salt: z.string().length(24),
    wrappedKey: z.string().min(1).max(16_384),
    deviceKey: z.string().min(1).max(16_384).optional(),
    index: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    secrets: z.record(z.uuid(), z.string().min(1).max(32_768))
  })
  .strict()
export type VaultEnvelope = z.infer<typeof vaultEnvelopeSchema>

export function requireVaultProtection(store: SecretStore): void {
  if (!store.isEncryptionAvailable() || store.describeProtectionGap() !== null) {
    throw new Error('Vault requires an available OS keychain. Plaintext storage is disabled.')
  }
}

export function sealVaultBytes(key: Buffer, binding: string, plain: Buffer): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(binding))
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64')
}

export function openVaultBytes(key: Buffer, binding: string, sealed: string): Buffer {
  const bytes = Buffer.from(sealed, 'base64')
  if (bytes.length < 28 || bytes.toString('base64') !== sealed) {
    throw new Error('Vault authentication failed.')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12), {
    authTagLength: 16
  })
  decipher.setAAD(Buffer.from(binding))
  decipher.setAuthTag(bytes.subarray(12, 28))
  let partial: Buffer | undefined
  try {
    partial = decipher.update(bytes.subarray(28))
    return Buffer.concat([partial, decipher.final()])
  } catch {
    throw new Error('Vault authentication failed.')
  } finally {
    partial?.fill(0)
  }
}

async function deriveVaultKey(passphrase: string, salt: string): Promise<Buffer> {
  const bytes = Buffer.from(salt, 'base64')
  if (bytes.length !== 16 || bytes.toString('base64') !== salt) {
    throw new Error('Vault authentication failed.')
  }
  const password = Buffer.from(passphrase.normalize('NFC'))
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        bytes,
        32,
        { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key))
      )
    })
  } finally {
    password.fill(0)
  }
}

export async function wrapVaultKey(
  key: Buffer,
  passphrase: string,
  binding: string,
  store: SecretStore
): Promise<Pick<VaultEnvelope, 'salt' | 'kdf' | 'wrappedKey'>> {
  requireVaultProtection(store)
  const salt = randomBytes(16).toString('base64')
  const derived = await deriveVaultKey(passphrase, salt)
  try {
    const sealed = sealVaultBytes(derived, `${binding}:key`, key)
    return {
      kdf: 'scrypt-131072-8-1',
      salt,
      wrappedKey: store.encryptString(sealed).toString('base64')
    }
  } finally {
    derived.fill(0)
  }
}

export async function unwrapVaultKey(
  envelope: VaultEnvelope,
  passphrase: string,
  binding: string,
  store: SecretStore
): Promise<Buffer> {
  requireVaultProtection(store)
  let derived: Buffer | undefined
  let key: Buffer | undefined
  try {
    const sealed = store.decryptString(Buffer.from(envelope.wrappedKey, 'base64'))
    derived = await deriveVaultKey(passphrase, envelope.salt)
    key = openVaultBytes(derived, `${binding}:key`, sealed)
    if (key.length !== 32) {
      throw new Error('key length')
    }
    return key
  } catch {
    key?.fill(0)
    throw new Error('Could not unlock Vault. Check the master password and this device’s keychain.')
  } finally {
    derived?.fill(0)
  }
}
