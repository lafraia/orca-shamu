import { app, dialog, ipcMain, powerMonitor, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { ProjectChannelsStore } from '../project-channels-store'
import {
  describeVaultArgument,
  vaultEntryInputSchema,
  type VaultAccess
} from '../../shared/shamu-vault'
import { VaultFile } from '../shamu-vault/vault-file'
import { VaultStore } from '../shamu-vault/vault-store'
import { VaultCommandBroker } from '../shamu-vault/vault-command-broker'
import { VaultService } from '../shamu-vault/vault-service'
import { getTrustedUIRendererWindow, isTrustedUIRenderer } from './ui'
import { getSecretStore } from '../../shared/secret-store'
import { VaultWindowSession } from '../shamu-vault/vault-window-session'
import { onMainWindowBecameVisible } from '../window/main-window-visibility'

const accessSchema = z
  .object({
    botId: z.string().min(1).max(1024),
    session: z.uuid(),
    revision: z.number().int().nonnegative()
  })
  .strict()
let disposeCurrent: (() => void) | null = null

export function registerShamuVaultHandlers(
  profile: string,
  channels: Pick<ProjectChannelsStore, 'read'>
): VaultService {
  disposeCurrent?.()
  let lifetime: VaultWindowSession | null = null
  const disposers: (() => void)[] = []
  const changed = (): void => {
    const owner = getTrustedUIRendererWindow()?.webContents
    if (owner && !owner.isDestroyed() && isTrustedUIRenderer(owner)) {
      owner.send('shamuVault:changed', {
        unlocked: store.unlocked,
        pendingBotIds: broker.pendingBotIds()
      })
    }
  }
  const store = new VaultStore(
    new VaultFile(profile),
    changed,
    () => lifetime?.isOpen() ?? false,
    getSecretStore,
    Date.now
  )
  const broker = new VaultCommandBroker(store, changed, async (request, entry) => {
    const window = getTrustedUIRendererWindow()
    if (!window || !lifetime?.isOpen()) {
      return false
    }
    const bot = (await channels.read()).channels.find((row) => row.id === request.botId)
    if (!bot || !lifetime?.isOpen()) {
      return false
    }
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Use Vault credential',
      message: `Allow this program to use “${entry.name}” once?`,
      detail: [
        'This program receives the credential and can transmit or save it. Its output will not be returned to the agent.',
        `Requested for bot: ${describeVaultArgument(bot.name)}`,
        `Executable: ${describeVaultArgument(request.program)}`,
        `Arguments: ${describeVaultArgument(request.args)}`,
        `Folder: ${describeVaultArgument(request.cwd)}`,
        `Environment variable: ${entry.environmentVariable}`,
        'Approve only a program and arguments you trust.'
      ].join('\n\n'),
      buttons: ['Cancel', 'Allow once'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    return result.response === 1
  })
  const service = new VaultService(store, broker)
  lifetime = new VaultWindowSession(store, {
    getWindow: getTrustedUIRendererWindow,
    isTrusted: isTrustedUIRenderer,
    onVisible: onMainWindowBecameVisible
  })
  lifetime.start()
  const lock = (): void => store.lock()
  const trust = (event: IpcMainInvokeEvent): void => {
    if (!isTrustedUIRenderer(event.sender) || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Vault is available only in the main Orca Shamu window.')
    }
    lifetime?.connect()
  }
  const requireBot = async (input: unknown, admitted: () => void): Promise<string> => {
    const botId = z.string().min(1).max(1024).parse(input)
    if (!(await channels.read()).channels.some((row) => row.id === botId && row.home?.ready)) {
      throw new Error('This bot is unavailable.')
    }
    admitted()
    return botId
  }
  const access = async (input: unknown, admitted: () => void): Promise<VaultAccess> => {
    const parsed = accessSchema.parse(input)
    await requireBot(parsed.botId, admitted)
    return parsed
  }
  const handle = (
    name: string,
    handler: (admitted: () => void, ...args: unknown[]) => unknown
  ): void => {
    const channel = `shamuVault:${name}`
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      trust(event)
      if (process.platform === 'win32' && name !== 'lock') {
        const admitted = store.admit()
        return store.prepare().then(() => {
          admitted()
          return handler(admitted, ...args)
        })
      }
      return handler(store.admit(), ...args)
    })
    disposers.push(() => ipcMain.removeHandler(channel))
  }
  handle('status', async (admitted, bot) => service.status(await requireBot(bot, admitted)))
  handle('create', async (admitted, bot, password) =>
    store.create(await requireBot(bot, admitted), z.string().parse(password))
  )
  handle('unlock', async (admitted, bot, password) =>
    store.unlock(await requireBot(bot, admitted), z.string().parse(password))
  )
  handle('resume', async (admitted, bot) => {
    const botId = await requireBot(bot, admitted)
    await lifetime!.resume()
    return service.status(botId)
  })
  handle('lock', lock)
  handle('save', async (admitted, raw, entry) =>
    store.save(await access(raw, admitted), vaultEntryInputSchema.parse(entry))
  )
  handle('remove', async (admitted, raw, id) =>
    store.remove(await access(raw, admitted), z.uuid().parse(id))
  )
  handle('copy', async (admitted, raw, id, password) =>
    service.copy(await access(raw, admitted), z.uuid().parse(id), z.string().parse(password))
  )
  handle('changePassphrase', async (admitted, raw, current, next) =>
    store.changePassphrase(
      await access(raw, admitted),
      z.string().parse(current),
      z.string().parse(next)
    )
  )
  handle('decide', async (admitted, raw, id, approve) =>
    broker.decide(await access(raw, admitted), z.uuid().parse(id), z.boolean().parse(approve))
  )
  const sleeping = (): void => lifetime?.setSleeping(true)
  const awake = (): void => lifetime?.setSleeping(false)
  const screenLocked = (): void => lifetime?.setScreenLocked(true)
  const screenUnlocked = (): void => lifetime?.setScreenLocked(false)
  const closing = (): void => lifetime?.suspend()
  powerMonitor.on('suspend', sleeping)
  powerMonitor.on('resume', awake)
  powerMonitor.on('lock-screen', screenLocked)
  powerMonitor.on('unlock-screen', screenUnlocked)
  powerMonitor.on('shutdown', closing)
  app.on('before-quit', closing)
  disposeCurrent = () => {
    lifetime?.dispose()
    service.dispose()
    powerMonitor.removeListener('suspend', sleeping)
    powerMonitor.removeListener('resume', awake)
    powerMonitor.removeListener('lock-screen', screenLocked)
    powerMonitor.removeListener('unlock-screen', screenUnlocked)
    powerMonitor.removeListener('shutdown', closing)
    app.removeListener('before-quit', closing)
    for (const dispose of disposers) {
      dispose()
    }
  }
  return service
}
