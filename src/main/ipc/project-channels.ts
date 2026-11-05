import { BotMentionDelivery } from '../bot-mention-delivery'
import { botMentionRequestSchema } from '../../shared/bot-mentions'
import { app, BrowserWindow, ipcMain } from 'electron'
import { BotCommandService, installBotCommandService } from '../shamu-bots/bot-command-service'
import { BotRoutineService } from '../shamu-bots/bot-routine-service'
import { getBundledLauncherPath } from '../cli/bundled-cli-launcher-path'
import { z } from 'zod'
import type { Store } from '../persistence/loading-store/store'
import { ProjectChannelsStore } from '../project-channels-store'
import { isTrustedUIRenderer } from './ui'
import type { ShamuPrimaryConnection } from '../shamu-primary-connection'
import { projectChannelsSnapshotSchema } from '../../shared/project-channels'
import { BotConversationService } from '../bot-conversation-service'
import { BotMemoryService } from '../bot-memory-service'

export function registerProjectChannelsHandlers(
  store: Store,
  primary?: ShamuPrimaryConnection | null
): void {
  const channels = new ProjectChannelsStore(store.getProfileStorageDirectory())
  const memory = primary ? new BotMemoryService(channels, primary) : null
  for (const name of ['readMemory', 'writeMemory', 'prepareMessage']) {
    ipcMain.removeHandler(`projectChannels:${name}`)
  }
  ipcMain.removeHandler('projectChannels:notifyBots')
  ipcMain.removeHandler('projectChannels:read')
  ipcMain.removeHandler('projectChannels:write')
  ipcMain.removeHandler('projectChannels:ensureConversation')
  const bots = primary
    ? new BotConversationService(
        channels,
        primary,
        app.getPath('home'),
        store.getProfileStorageDirectory(),
        {
          cliExecutable: getBundledLauncherPath(process.platform, process.resourcesPath) ?? 'orca',
          userDataDirectory: app.getPath('userData')
        }
      )
    : null
  const mentions =
    primary && bots
      ? new BotMentionDelivery(channels, bots, primary, store.getProfileStorageDirectory(), memory)
      : null
  const changed = (): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (isTrustedUIRenderer(window.webContents)) {
        window.webContents.send('projectChannels:changed')
      }
    }
  }
  const commands =
    primary && bots && memory && mentions
      ? new BotCommandService(
          channels,
          bots,
          mentions,
          new BotRoutineService(
            channels,
            bots,
            memory,
            primary,
            store.getProfileStorageDirectory()
          ),
          primary,
          changed
        )
      : null
  installBotCommandService(commands)
  void bots?.refreshGuides().catch(() => {
    console.warn('[shamu] Could not refresh bot guides. Open the bot to retry.')
  })
  ipcMain.removeHandler('projectChannels:command')
  ipcMain.handle('projectChannels:command', async (event, input: unknown) => {
    trusted(event)
    if (!commands) {
      throw new Error('Bot controls are available in Orca Shamu.')
    }
    return commands.invoke(input)
  })
  const trusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted project conversation request.')
    }
  }
  const id = z.string().min(1).max(1024)
  ipcMain.handle('projectChannels:readMemory', async (event, channelId: unknown) => {
    trusted(event)
    if (!memory) {
      throw new Error('Bot memory is available in Orca Shamu.')
    }
    return memory.read(id.parse(channelId))
  })
  ipcMain.handle(
    'projectChannels:writeMemory',
    async (event, channelId: unknown, input: unknown, fingerprint: unknown) => {
      trusted(event)
      if (!memory) {
        throw new Error('Bot memory is available in Orca Shamu.')
      }
      return memory.write(
        id.parse(channelId),
        input,
        z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(fingerprint)
      )
    }
  )
  ipcMain.handle(
    'projectChannels:prepareMessage',
    async (event, session: unknown, environment: unknown, text: unknown) => {
      trusted(event)
      const prompt = z
        .string()
        .max(256 * 1024)
        .parse(text)
      return memory
        ? memory.prepare(id.parse(session), id.nullable().parse(environment), prompt)
        : prompt
    }
  )
  ipcMain.handle('projectChannels:notifyBots', async (event, input: unknown) => {
    trusted(event)
    if (!mentions) {
      throw new Error('Bot mentions are available in Orca Shamu.')
    }
    return mentions.deliver(botMentionRequestSchema.parse(input))
  })
  ipcMain.handle('projectChannels:read', (event) => {
    trusted(event)
    return channels.read()
  })
  ipcMain.handle('projectChannels:write', async (event, input: unknown) => {
    trusted(event)
    const snapshot = projectChannelsSnapshotSchema.parse(input)
    await primary?.assertChannelAuthority(snapshot)
    return channels.write(snapshot)
  })
  ipcMain.handle('projectChannels:ensureConversation', async (event, input: unknown) => {
    trusted(event)
    if (!bots) {
      throw new Error('Open this bot in Orca Shamu connected to the primary Orca.')
    }
    return bots.ensure(z.string().min(1).max(1024).parse(input))
  })
}
