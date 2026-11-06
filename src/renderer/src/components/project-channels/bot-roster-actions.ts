import type { BotCommand } from '../../../../shared/bot-commands'
import { refreshProjectChannelRoster, useProjectChannels } from './project-channel-store'
import type { BotSidebarDragItem } from './BotSidebarDrag'

export async function runBotRosterCommand(
  command: BotCommand,
  { reportError = true }: { reportError?: boolean } = {}
): Promise<void> {
  try {
    await window.api.projectChannels!.command(command)
    await refreshProjectChannelRoster()
  } catch (error) {
    if (reportError) {
      useProjectChannels.setState({
        error: error instanceof Error ? error.message : 'Could not update this bot.'
      })
    }
    throw error
  }
}

export async function moveBotSidebarItem(
  item: BotSidebarDragItem,
  direction: 'up' | 'down'
): Promise<void> {
  if (item.kind === 'section') {
    if (item.section !== null) {
      await runBotRosterCommand({ action: 'section.move', name: item.section, direction })
    }
    return
  }
  const bots = useProjectChannels
    .getState()
    .snapshot.channels.filter((bot) =>
      item.section === null ? bot.pinned : !bot.pinned && (bot.section ?? '') === item.section
    )
  const index = bots.findIndex((bot) => `bot:${bot.id}` === item.id)
  const neighbor = bots[index + (direction === 'up' ? -1 : 1)]
  if (index !== -1 && neighbor) {
    await runBotRosterCommand({
      action: 'reorder',
      move: {
        kind: 'bot',
        botId: bots[index].id,
        section: item.section,
        relativeTo: neighbor.id,
        placement: direction === 'up' ? 'before' : 'after'
      }
    })
  }
}
