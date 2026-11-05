import type { BotCommunication } from '../../../../shared/bot-communications'
import { readBotTurnPrompt } from '../../../../shared/bot-turn-context'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { readAgentJournalTurn } from '../../../../shared/agent-session/lifecycle/agent-session-turn-record'
import { isRootAgentJournalItem } from '../../../../shared/agent-session/journal/agent-session-journal-producer'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'

const references = new WeakMap<NativeChatMessage, string | null>()
function notificationReference(message: NativeChatMessage): string | null {
  if (references.has(message)) {
    return references.get(message) ?? null
  }
  const text = message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  const visible = readBotTurnPrompt(text)?.message ?? text
  const reference = visible.startsWith('The user mentioned you (@')
    ? (visible.match(
        /\n\nNotification reference: ([0-9a-f-]{36})\. Use the Shamu bot context command/
      )?.[1] ?? null)
    : null
  references.set(message, reference)
  return reference
}

export function nativeChatBotCommunicationTurns(
  entries: readonly BotCommunication[],
  sessionId: string,
  messages: readonly NativeChatMessage[],
  turnKeys: readonly (string | undefined)[],
  submissions: readonly AgentJournalSubmission[],
  items: readonly AgentJournalRenderItem[] = []
) {
  const incoming = entries.filter((entry) => entry.recipient.sessionId === sessionId)
  const operations = new Map(incoming.map((entry) => [entry.recipient.operationId, entry]))
  const aliases = new Map(
    incoming.map((entry) => [agentJournalSubmissionKey(entry.recipient.operationId), entry])
  )
  for (const entry of incoming) {
    if (entry.native) {
      aliases.set(entry.native.itemId, entry)
    }
  }
  for (const submission of submissions) {
    const entry = operations.get(submission.queuedMessageId ?? submission.clientMessageId)
    if (!entry) {
      continue
    }
    aliases.set(agentJournalSubmissionKey(submission.clientMessageId), entry)
    if (submission.providerItemId) {
      aliases.set(submission.providerItemId, entry)
    }
  }
  for (const item of items) {
    const turn = readAgentJournalTurn(item.body)
    const entry = turn?.userItemId ? aliases.get(turn.userItemId) : undefined
    if (entry && isRootAgentJournalItem(item)) {
      aliases.set(item.itemId, entry)
    }
  }
  const prompts = new Map<string, BotCommunication>()
  const turns = new Map(aliases)
  for (const [index, message] of messages.entries()) {
    if (message.role !== 'user') {
      continue
    }
    const entry = aliases.get(message.id)
    const matches = entry?.native
      ? message.from?.senders.length === 1 &&
        message.from.senders[0].party.orcaSessionId === entry.source.sessionId &&
        !message.from.senders[0].party.address.startsWith('dispatch:')
      : entry && notificationReference(message) === entry.referenceId
    if (!entry || !matches) {
      continue
    }
    prompts.set(message.id, entry)
    const turnKey = turnKeys[index]
    if (turnKey) {
      turns.set(turnKey, entry)
    }
  }
  const mixed = new Set<string>()
  for (const [index, message] of messages.entries()) {
    const key = turnKeys[index]
    if (key && turns.has(key) && message.role === 'user' && !prompts.has(message.id)) {
      mixed.add(key)
    }
  }
  return { prompts, turns, mixed }
}
