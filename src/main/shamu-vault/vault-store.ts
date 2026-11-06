import { randomUUID, timingSafeEqual } from 'node:crypto'
import { getSecretStore, type SecretStore } from '../../shared/secret-store'
import {
  vaultEntryInputSchema,
  vaultNewPassphraseSchema,
  vaultPassphraseSchema,
  type VaultAccess,
  type VaultEntry,
  type VaultEntryInput,
  type VaultSnapshot
} from '../../shared/shamu-vault'
import type { VaultFile } from './vault-file'
import {
  openVaultBytes,
  requireVaultProtection,
  sealVaultBytes,
  unwrapVaultKey,
  wrapVaultKey,
  type VaultEnvelope
} from './vault-crypto'

import {
  createVaultSession,
  openVaultSession,
  sealVaultIndex,
  type VaultIndex,
  type VaultSession as Session
} from './vault-session'

import { vaultSnapshot } from './vault-snapshot'

export class VaultStore {
  private session: Session | null = null
  private generation = 0
  private authenticating = false
  private readonly lockListeners = new Set<() => void>()

  constructor(
    private readonly file: VaultFile,
    private readonly changed: () => void,
    private readonly secretStore: () => SecretStore = getSecretStore,
    private readonly now: () => number = Date.now
  ) {}

  onLock(listener: () => void): () => void {
    this.lockListeners.add(listener)
    return () => this.lockListeners.delete(listener)
  }

  admit(): () => void {
    const generation = this.generation
    return () => this.assertGeneration(generation)
  }

  get unlocked(): boolean {
    return this.session !== null
  }

  lock(): void {
    this.generation++
    this.session?.key.fill(0)
    this.session = null
    for (const listener of this.lockListeners) {
      listener()
    }
    this.changed()
  }

  expire(systemIdleSeconds = 0): void {
    if (
      this.session &&
      (this.now() - this.session.touchedAt >= 5 * 60_000 || systemIdleSeconds >= 300)
    ) {
      this.lock()
    }
  }

  status(botId: string): VaultSnapshot {
    this.expire()
    return vaultSnapshot(
      this.file,
      this.secretStore(),
      this.session,
      botId,
      () => this.lock(),
      (id) => {
        this.assertSession(id)
      }
    )
  }

  create(botId: string, input: string): Promise<VaultSnapshot> {
    return this.open(botId, vaultNewPassphraseSchema.parse(input), createVaultSession)
  }

  unlock(botId: string, input: string): Promise<VaultSnapshot> {
    return this.open(botId, vaultPassphraseSchema.parse(input), openVaultSession)
  }

  private open(
    botId: string,
    password: string,
    prepare: typeof createVaultSession
  ): Promise<VaultSnapshot> {
    return this.authenticate(async (generation) => {
      const session = await prepare(this.file, this.secretStore(), password, this.admit(), this.now)
      this.publish(session, generation)
      return this.status(botId)
    })
  }

  private publish(session: Session, generation: number): void {
    try {
      this.assertGeneration(generation)
    } catch (error) {
      session.key.fill(0)
      throw error
    }
    this.session = session
    this.changed()
  }

  save(access: VaultAccess, input: VaultEntryInput): VaultSnapshot {
    const current = this.access(access)
    const parsed = vaultEntryInputSchema.parse(input)
    const previous = parsed.id ? this.entry(access, parsed.id) : null
    if (!parsed.secret && !previous) {
      throw new Error('Enter a password or token.')
    }
    if (!previous && current.index.entries.length >= 500) {
      throw new Error('Vault is full.')
    }
    const { secret, id: _id, ...metadata } = parsed
    const entry: VaultEntry = {
      ...metadata,
      id: previous?.id ?? randomUUID(),
      botId: access.botId,
      sealId: previous && !secret ? previous.sealId : randomUUID(),
      updatedAt: this.now()
    }
    const secrets = { ...current.envelope.secrets }
    if (secret) {
      const bytes = Buffer.from(secret)
      try {
        secrets[entry.id] = sealVaultBytes(current.key, this.entryBinding(current, entry), bytes)
      } finally {
        bytes.fill(0)
      }
    }
    const entries = previous
      ? current.index.entries.map((row) => (row.id === entry.id ? entry : row))
      : [...current.index.entries, entry]
    this.persist(
      current,
      { revision: current.index.revision + 1, entries },
      { ...current.envelope, secrets }
    )
    return this.status(access.botId)
  }

  remove(access: VaultAccess, id: string): VaultSnapshot {
    const current = this.access(access)
    this.entry(access, id)
    const { [id]: _removed, ...secrets } = current.envelope.secrets
    this.persist(
      current,
      {
        revision: current.index.revision + 1,
        entries: current.index.entries.filter((row) => row.id !== id)
      },
      { ...current.envelope, secrets }
    )
    return this.status(access.botId)
  }

  entry(access: VaultAccess, id: string, agent = false): VaultEntry {
    const current = this.access(access)
    const entry = current.index.entries.find(
      (row) => row.id === id && row.botId === access.botId && (!agent || row.allowAgent)
    )
    if (!entry) {
      throw new Error('This credential is not available to this bot.')
    }
    return { ...entry }
  }

  useSecret<T>(access: VaultAccess, id: string, consume: (secret: Buffer) => T, agent = false): T {
    const current = this.access(access)
    const entry = this.entry(access, id, agent)
    const bytes = openVaultBytes(
      current.key,
      this.entryBinding(current, entry),
      current.envelope.secrets[id]
    )
    try {
      return consume(bytes)
    } finally {
      bytes.fill(0)
    }
  }

  async verify(access: VaultAccess, input: string): Promise<void> {
    const current = this.access(access)
    const passphrase = vaultPassphraseSchema.parse(input)
    if (this.authenticating) {
      throw new Error('Another Vault authentication is in progress.')
    }
    this.authenticating = true
    let key: Buffer | undefined
    try {
      key = await unwrapVaultKey(
        current.envelope,
        passphrase,
        `${this.file.binding}:${current.envelope.id}`,
        this.secretStore()
      )
      this.access(access)
      if (!timingSafeEqual(key, current.key)) {
        throw new Error('Vault authentication failed.')
      }
      current.touchedAt = this.now()
    } finally {
      key?.fill(0)
      this.authenticating = false
    }
  }

  async changePassphrase(
    access: VaultAccess,
    currentPassword: string,
    nextPassword: string
  ): Promise<void> {
    vaultNewPassphraseSchema.parse(nextPassword)
    await this.verify(access, currentPassword)
    const current = this.access(access)
    if (this.authenticating) {
      throw new Error('Another Vault authentication is in progress.')
    }
    this.authenticating = true
    try {
      const wrapped = await wrapVaultKey(
        current.key,
        nextPassword,
        `${this.file.binding}:${current.envelope.id}`,
        this.secretStore()
      )
      this.access(access)
      this.persist(
        current,
        { ...current.index, revision: current.index.revision + 1 },
        { ...current.envelope, ...wrapped }
      )
      this.lock()
    } finally {
      this.authenticating = false
    }
  }

  private access(access: VaultAccess): Session {
    const current = this.assertSession(access.session)
    if (current.index.revision !== access.revision) {
      throw new Error('Vault changed. Refresh it before trying again.')
    }
    return current
  }

  private assertSession(id: string): Session {
    this.expire()
    const current = this.session
    if (!current || current.id !== id) {
      throw new Error('Vault is locked. Unlock it in Orca Shamu.')
    }
    try {
      requireVaultProtection(this.secretStore())
      if (this.file.read()?.fingerprint !== current.fingerprint) {
        throw new Error('changed')
      }
    } catch {
      this.lock()
      throw new Error('Vault changed or its protection is unavailable. Unlock it again.')
    }
    return current
  }

  private async authenticate<T>(operation: (generation: number) => Promise<T>): Promise<T> {
    if (this.authenticating) {
      throw new Error('Another Vault authentication is in progress.')
    }
    this.lock()
    this.authenticating = true
    const generation = this.generation
    try {
      return await operation(generation)
    } finally {
      this.authenticating = false
    }
  }

  private assertGeneration(generation: number): void {
    if (generation !== this.generation) {
      throw new Error('Vault authentication was cancelled. Unlock it again.')
    }
  }

  private entryBinding(current: Session, entry: VaultEntry): string {
    return `${this.file.binding}:${current.envelope.id}:secret:${entry.botId}:${entry.id}:${entry.sealId}`
  }
  private persist(current: Session, index: VaultIndex, envelope: VaultEnvelope): void {
    envelope.index = sealVaultIndex(current.key, `${this.file.binding}:${envelope.id}`, index)
    try {
      const fingerprint = this.file.write(envelope, current.fingerprint)
      Object.assign(current, { envelope, index, fingerprint, touchedAt: this.now() })
    } catch (error) {
      this.lock()
      throw error
    }
    this.changed()
  }
}
