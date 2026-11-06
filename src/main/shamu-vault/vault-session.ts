import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { SecretStore } from '../../shared/secret-store'
import { vaultEntrySchema } from '../../shared/shamu-vault'
import type { VaultFile } from './vault-file'
import { openVaultDeviceKey, sealVaultDeviceKey } from './vault-device-key'
import {
  openVaultBytes,
  sealVaultBytes,
  unwrapVaultKey,
  wrapVaultKey,
  type VaultEnvelope
} from './vault-crypto'

const indexSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    entries: z.array(vaultEntrySchema).max(500)
  })
  .strict()
  .refine(({ entries }) => new Set(entries.map((row) => row.id)).size === entries.length)
export type VaultIndex = z.infer<typeof indexSchema>
export type VaultSession = {
  id: string
  key: Buffer
  envelope: VaultEnvelope
  fingerprint: string
  index: VaultIndex
}

export async function verifyVaultSessionPassword(
  session: VaultSession,
  password: string,
  binding: string,
  store: SecretStore,
  assertCurrent: () => void
): Promise<void> {
  const key = await unwrapVaultKey(session.envelope, password, binding, store)
  try {
    assertCurrent()
    if (!timingSafeEqual(key, session.key)) {
      throw new Error('Vault authentication failed.')
    }
  } finally {
    key.fill(0)
  }
}

export function sealVaultIndex(key: Buffer, binding: string, index: VaultIndex): string {
  const bytes = Buffer.from(JSON.stringify(index))
  try {
    return sealVaultBytes(key, `${binding}:index`, bytes)
  } finally {
    bytes.fill(0)
  }
}

export async function createVaultSession(
  file: VaultFile,
  store: SecretStore,
  password: string,
  admitted: () => void
): Promise<VaultSession> {
  if (file.read()) {
    throw new Error('Vault already exists. Unlock it instead.')
  }
  const key = randomBytes(32)
  try {
    const id = randomUUID()
    const binding = `${file.binding}:${id}`
    const wrapped = await wrapVaultKey(key, password, binding, store)
    admitted()
    const index = { revision: 0, entries: [] }
    const envelope: VaultEnvelope = {
      format: 'orca-shamu-vault',
      version: 1,
      id,
      ...wrapped,
      deviceKey: sealVaultDeviceKey(key, binding, store),
      index: sealVaultIndex(key, binding, index),
      secrets: {}
    }
    const fingerprint = file.write(envelope, null)
    return {
      id: randomUUID(),
      key: Buffer.from(key),
      envelope,
      fingerprint,
      index
    }
  } finally {
    key.fill(0)
  }
}

export async function openVaultSession(
  file: VaultFile,
  store: SecretStore,
  password: string,
  admitted: () => void
): Promise<VaultSession> {
  const persisted = file.read()
  if (!persisted) {
    throw new Error('Create Vault before unlocking it.')
  }
  const { envelope, fingerprint } = persisted
  const binding = `${file.binding}:${envelope.id}`
  const key = await unwrapVaultKey(envelope, password, binding, store)
  let session: VaultSession | undefined
  try {
    session = readVaultSession(key, envelope, fingerprint, binding, admitted)
    const deviceKey = sealVaultDeviceKey(key, binding, store)
    admitted()
    session.envelope = { ...envelope, deviceKey }
    session.fingerprint = file.write(session.envelope, fingerprint)
    return session
  } catch (error) {
    session?.key.fill(0)
    throw error
  } finally {
    key.fill(0)
  }
}

export async function openDeviceVaultSession(
  file: VaultFile,
  store: SecretStore,
  admitted: () => void
): Promise<VaultSession | null> {
  const persisted = file.read()
  if (!persisted?.envelope.deviceKey) {
    return null
  }
  const { envelope, fingerprint } = persisted
  const binding = `${file.binding}:${envelope.id}`
  const key = openVaultDeviceKey(envelope.deviceKey!, binding, store)
  try {
    return readVaultSession(key, envelope, fingerprint, binding, admitted)
  } finally {
    key.fill(0)
  }
}

function readVaultSession(
  key: Buffer,
  envelope: VaultEnvelope,
  fingerprint: string,
  binding: string,
  admitted: () => void
): VaultSession {
  let bytes: Buffer | undefined
  try {
    admitted()
    bytes = openVaultBytes(key, `${binding}:index`, envelope.index)
    const index = indexSchema.parse(JSON.parse(bytes.toString('utf8')))
    if (
      Object.keys(envelope.secrets).length !== index.entries.length ||
      index.entries.some((row) => !envelope.secrets[row.id])
    ) {
      throw new Error('index mismatch')
    }
    return {
      id: randomUUID(),
      key: Buffer.from(key),
      envelope,
      fingerprint,
      index
    }
  } catch {
    throw new Error('Could not authenticate Vault contents. The file has not been replaced.')
  } finally {
    bytes?.fill(0)
  }
}
