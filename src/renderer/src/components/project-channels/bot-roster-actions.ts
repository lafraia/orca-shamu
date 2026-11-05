import type { BotCommand } from '../../../../shared/bot-commands'
import { refreshProjectChannelRoster, useProjectChannels } from './project-channel-store'

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
