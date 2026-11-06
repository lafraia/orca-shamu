import { clipboard } from 'electron'
import type { ProjectChannel } from '../../shared/project-channels'
import type { VaultAccess, VaultAgentCommand, VaultSnapshot } from '../../shared/shamu-vault'
import type { VaultStore } from './vault-store'
import type { VaultCommandBroker } from './vault-command-broker'

export class VaultService {
  private clipboardValue: string | null = null
  private clipboardTimer: ReturnType<typeof setTimeout> | undefined
  private readonly detachLock: () => void

  constructor(
    readonly store: VaultStore,
    readonly broker: VaultCommandBroker
  ) {
    this.detachLock = store.onLock(() => this.clearClipboard())
  }

  status(botId: string): VaultSnapshot {
    const snapshot = this.store.status(botId)
    return { ...snapshot, requests: snapshot.state === 'unlocked' ? this.broker.list(botId) : [] }
  }

  async copy(access: VaultAccess, id: string, passphrase: string): Promise<void> {
    await this.store.verify(access, passphrase)
    this.clearClipboard()
    this.store.useSecret(access, id, (bytes) => {
      this.clipboardValue = bytes.toString('utf8')
      clipboard.writeText(this.clipboardValue)
    })
    this.clipboardTimer = setTimeout(() => this.clearClipboard(), 30_000)
    this.clipboardTimer.unref()
  }

  invoke(command: VaultAgentCommand, bot: ProjectChannel): unknown {
    switch (command.action) {
      case 'vault.list': {
        const snapshot = this.store.status(bot.id)
        return {
          state: snapshot.state,
          entries: snapshot.entries
            .filter((row) => row.allowAgent)
            .map((row) => ({
              id: row.id,
              name: row.name,
              environmentVariable: row.environmentVariable,
              reference: `vault://${row.id}`
            }))
        }
      }
      case 'vault.run':
        return this.broker.request(command, bot)
      case 'vault.result':
        if (this.store.status(bot.id).state !== 'unlocked') {
          throw new Error('Open and unlock Vault in Orca Shamu to inspect requests.')
        }
        return this.broker.result(bot.id, command.requestId)
    }
  }

  clearClipboard(): void {
    clearTimeout(this.clipboardTimer)
    this.clipboardTimer = undefined
    if (this.clipboardValue !== null && clipboard.readText() === this.clipboardValue) {
      clipboard.clear()
    }
    this.clipboardValue = null
  }

  dispose(): void {
    this.store.lock()
    this.clearClipboard()
    this.detachLock()
    this.broker.dispose()
  }
}
