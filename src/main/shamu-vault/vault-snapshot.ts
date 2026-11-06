import type { SecretStore } from '../../shared/secret-store'
import type { VaultSnapshot } from '../../shared/shamu-vault'
import type { VaultFile } from './vault-file'
import { requireVaultProtection } from './vault-crypto'
import type { VaultSession } from './vault-session'

export function vaultSnapshot(
  file: VaultFile,
  store: SecretStore,
  session: VaultSession | null,
  botId: string,
  lock: () => void,
  assertSession: (id: string) => void,
  ownerIsOpen: boolean
): VaultSnapshot {
  if (!ownerIsOpen) {
    if (session) {
      lock()
    }
    return {
      state: 'locked',
      session: null,
      revision: 0,
      entries: [],
      requests: [],
      automaticUnlock: Boolean(file.read()?.envelope.deviceKey)
    }
  }
  try {
    requireVaultProtection(store)
  } catch {
    if (session) {
      lock()
    }
    return {
      state: 'unavailable',
      session: null,
      revision: 0,
      entries: [],
      requests: [],
      automaticUnlock: false
    }
  }
  if (!session) {
    const persisted = file.read()
    return {
      state: persisted ? 'locked' : 'missing',
      session: null,
      revision: 0,
      entries: [],
      requests: [],
      automaticUnlock: Boolean(persisted?.envelope.deviceKey)
    }
  }
  assertSession(session.id)
  return {
    state: 'unlocked',
    session: session.id,
    revision: session.index.revision,
    entries: session.index.entries.filter((row) => row.botId === botId).map((row) => ({ ...row })),
    requests: [],
    automaticUnlock: Boolean(session.envelope.deviceKey)
  }
}
