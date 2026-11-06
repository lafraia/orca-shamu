import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerMonitor,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
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
import { isTrustedUIRenderer } from './ui'

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
  channels: ProjectChannelsStore
): VaultService {
  disposeCurrent?.()
  let owner: WebContents | null = null
  const disposers: (() => void)[] = []
  const changed = (): void => {
    if (owner && !owner.isDestroyed()) {
      owner.send('shamuVault:changed', {
        unlocked: store.unlocked,
        pendingBotIds: broker.pendingBotIds()
      })
    }
  }
  const store = new VaultStore(new VaultFile(profile), changed)
  const broker = new VaultCommandBroker(store, changed, async (request, entry) => {
    const window = owner && !owner.isDestroyed() ? BrowserWindow.fromWebContents(owner) : null
    if (!window || !owner || !isTrustedUIRenderer(owner)) {
      return false
    }
    const bot = (await channels.read()).channels.find((row) => row.id === request.botId)
    if (!bot) {
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
  const lock = (): void => store.lock()
  const trust = (event: IpcMainInvokeEvent): void => {
    if (!isTrustedUIRenderer(event.sender) || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Vault is available only in the main Orca Shamu window.')
    }
    if (owner === event.sender) {
      return
    }
    if (owner) {
      store.lock()
    }
    owner = event.sender
    const sender = owner
    const window = BrowserWindow.fromWebContents(sender)
    sender.on('did-start-loading', lock)
    sender.on('render-process-gone', lock)
    sender.on('destroyed', lock)
    window?.on('hide', lock)
    window?.on('minimize', lock)
    window?.on('closed', lock)
    disposers.push(() => {
      sender.removeListener('did-start-loading', lock)
      sender.removeListener('render-process-gone', lock)
      sender.removeListener('destroyed', lock)
      window?.removeListener('hide', lock)
      window?.removeListener('minimize', lock)
      window?.removeListener('closed', lock)
    })
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
  powerMonitor.on('suspend', lock)
  powerMonitor.on('lock-screen', lock)
  powerMonitor.on('shutdown', lock)
  app.on('before-quit', lock)
  const timer = setInterval(() => store.expire(powerMonitor.getSystemIdleTime()), 10_000)
  timer.unref()
  disposeCurrent = () => {
    service.dispose()
    clearInterval(timer)
    powerMonitor.removeListener('suspend', lock)
    powerMonitor.removeListener('lock-screen', lock)
    powerMonitor.removeListener('shutdown', lock)
    app.removeListener('before-quit', lock)
    for (const dispose of disposers) {
      dispose()
    }
  }
  return service
}
