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
  assertSession: (id: string) => void
): VaultSnapshot {
  try {
    requireVaultProtection(store)
  } catch {
    if (session) {
      lock()
    }
    return { state: 'unavailable', session: null, revision: 0, entries: [], requests: [] }
  }
  if (!session) {
    return {
      state: file.read() ? 'locked' : 'missing',
      session: null,
      revision: 0,
      entries: [],
      requests: []
    }
  }
  assertSession(session.id)
  return {
    state: 'unlocked',
    session: session.id,
    revision: session.index.revision,
    entries: session.index.entries.filter((row) => row.botId === botId).map((row) => ({ ...row })),
    requests: []
  }
}
