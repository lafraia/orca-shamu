import { setTimeout } from 'node:timers/promises'
import type { z } from 'zod'
import type { botAskResultSchema, botAskSchema } from '../../shared/bot-consultations'
import type { ProjectChannelsStore } from '../project-channels-store'
import type { BotMentionDelivery } from '../bot-mention-delivery'
import { requireBotUserRequest, type BotPrimary } from './bot-journal-reader'
import { readBotTurnPrompt } from '../../shared/bot-turn-context'

export class BotConsultationService {
  constructor(
    private readonly channels: Pick<ProjectChannelsStore, 'read'>,
    private readonly mentions: Pick<BotMentionDelivery, 'deliver' | 'result'>,
    private readonly primary: BotPrimary
  ) {}

  async ask(command: z.infer<typeof botAskSchema>) {
    const actor = (await this.channels.read()).channels.find((bot) => bot.id === command.actorId)
    const member = actor?.members.find((row) => row.id === actor.home?.memberId)
    const { environmentId } = await this.primary.read()
    if (
      !actor?.home?.ready ||
      !member ||
      member.target.kind !== 'environment' ||
      member.target.environmentId !== environmentId
    ) {
      throw new Error('The consulting bot must own a ready conversation on the primary Orca.')
    }
    if (command.botId === actor.id) {
      throw new Error('Consult another bot instead of starting a conversation with yourself.')
    }
    const source = await requireBotUserRequest(this.primary, member.sessionId, command.sourceItemId)
    const userText = readBotTurnPrompt(source)?.message ?? source
    if (command.text.replace(/\s+/g, ' ').trim() === userText.replace(/\s+/g, ' ').trim()) {
      throw new Error('Formulate your own bot question instead of forwarding the user message.')
    }
    const receipts = await this.mentions.deliver(
      {
        id: command.requestId,
        botIds: [command.botId],
        text: command.text,
        source: {
          environmentId: member.target.environmentId,
          sessionId: member.sessionId,
          worktreeId: member.worktreeId,
          label: actor.name
        }
      },
      { actorId: actor.id, sourceItemId: command.sourceItemId }
    )
    return { requestId: command.requestId, receipts }
  }

  async result(command: z.infer<typeof botAskResultSchema>) {
    const deadline = Date.now() + command.waitSeconds * 1000
    let result = await this.mentions.result(command.actorId, command.requestId)
    while (
      ['queued', 'running', 'recorded', 'unconfirmed'].includes(result.state) &&
      Date.now() < deadline
    ) {
      await setTimeout(Math.min(1000, Math.max(0, deadline - Date.now())))
      result = await this.mentions.result(command.actorId, command.requestId)
    }
    return result
  }
}
