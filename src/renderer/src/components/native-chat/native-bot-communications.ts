import type { BotCommunication } from '../../../../shared/bot-communications'
import type { ProjectChannel } from '../../../../shared/project-channels'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { AgentJournalSubmission } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import { nativeBotCommunicationBlocks } from './native-bot-communication-blocks'
import { isRootAgentJournalItem } from '../../../../shared/agent-session/journal/agent-session-journal-producer'

export function nativeBotCommunication(
  message: NativeChatMessage,
  sessionId: string,
  environmentId: string,
  bots: readonly ProjectChannel[],
  operationId = message.id
): BotCommunication | null {
  const senders = message.from?.senders
  if (
    message.role !== 'user' ||
    !isRootAgentJournalItem(message) ||
    message.agentStart ||
    senders?.length !== 1
  ) {
    return null
  }
  const sender = senders[0]
  const sourceId = sender.party.orcaSessionId
  if (!sourceId || sourceId === sessionId || sender.party.address.startsWith('dispatch:')) {
    return null
  }
  const botFor = (id: string) =>
    bots.find(
      (bot) =>
        bot.home?.ready &&
        bot.members.some(
          (member) =>
            member.id === bot.home?.memberId &&
            member.sessionId === id &&
            member.target.kind === 'environment' &&
            member.target.environmentId === environmentId
        )
    )
  const source = botFor(sourceId)
  const recipient = botFor(sessionId)
  if (!source && !recipient) {
    return null
  }
  const id = `native:${JSON.stringify([environmentId, sessionId, operationId])}`
  return {
    id,
    referenceId: id,
    environmentId,
    createdAt: message.timestamp ?? 0,
    source: {
      sessionId: sourceId,
      name: source?.name ?? sender.name ?? 'Workspace chat',
      botId: source?.id
    },
    recipient: {
      sessionId,
      name: recipient?.name ?? 'Workspace chat',
      botId: recipient?.id,
      operationId
    },
    actor: source ? 'bot' : 'workspace',
    state: 'recorded',
    native: { itemId: message.id, blocks: nativeBotCommunicationBlocks(message.blocks) }
  }
}

export function createNativeBotCommunicationProjection() {
  let prior:
    | { sessionId: string; environmentId: string; bots: readonly ProjectChannel[] }
    | undefined
  let cache = new WeakMap<NativeChatMessage, BotCommunication | null>()
  let entries: readonly BotCommunication[] = []
  return (
    messages: readonly NativeChatMessage[],
    sessionId: string,
    environmentId: string,
    bots: readonly ProjectChannel[],
    submissions: readonly AgentJournalSubmission[] = []
  ): readonly BotCommunication[] => {
    if (
      prior?.sessionId !== sessionId ||
      prior.environmentId !== environmentId ||
      prior.bots !== bots
    ) {
      cache = new WeakMap()
      prior = { sessionId, environmentId, bots }
    }
    const operations = new Map<string, string>()
    for (const submission of submissions) {
      const operationId = submission.queuedMessageId ?? submission.clientMessageId
      operations.set(agentJournalSubmissionKey(submission.clientMessageId), operationId)
      if (submission.providerItemId) {
        operations.set(submission.providerItemId, operationId)
      }
    }
    const next = messages.flatMap((message) => {
      const operationId = operations.get(message.id) ?? message.id
      let entry = cache.get(message)
      if (entry === undefined || (entry && entry.recipient.operationId !== operationId)) {
        entry = nativeBotCommunication(message, sessionId, environmentId, bots, operationId)
        cache.set(message, entry)
      }
      return entry ? [entry] : []
    })
    if (entries.length !== next.length || next.some((entry, index) => entries[index] !== entry)) {
      entries = next
    }
    return entries
  }
}
