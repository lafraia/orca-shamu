import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SecretStore } from '../../shared/secret-store'
import { vaultEntrySchema } from '../../shared/shamu-vault'
import type { VaultFile } from './vault-file'
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
  touchedAt: number
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
  admitted: () => void,
  now: () => number
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
      index: sealVaultIndex(key, binding, index),
      secrets: {}
    }
    const fingerprint = file.write(envelope, null)
    return {
      id: randomUUID(),
      key: Buffer.from(key),
      envelope,
      fingerprint,
      index,
      touchedAt: now()
    }
  } finally {
    key.fill(0)
  }
}

export async function openVaultSession(
  file: VaultFile,
  store: SecretStore,
  password: string,
  admitted: () => void,
  now: () => number
): Promise<VaultSession> {
  const persisted = file.read()
  if (!persisted) {
    throw new Error('Create Vault before unlocking it.')
  }
  const { envelope, fingerprint } = persisted
  const binding = `${file.binding}:${envelope.id}`
  const key = await unwrapVaultKey(envelope, password, binding, store)
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
      index,
      touchedAt: now()
    }
  } catch {
    throw new Error('Could not authenticate Vault contents. The file has not been replaced.')
  } finally {
    bytes?.fill(0)
    key.fill(0)
  }
}
