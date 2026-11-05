import type { BotCommunication } from '../../../../shared/bot-communications'
import type { ProjectChannel } from '../../../../shared/project-channels'
import type { StructuredAgentSessionState } from '../../../../shared/agent-session/structured-agent-session-reducer'
import { isRootAgentJournalItem } from '../../../../shared/agent-session/journal/agent-session-journal-producer'
import { nativeChatTurnMembership } from '../../../../shared/native-chat/transcript/native-chat-turn-membership'
import { projectStructuredAgentSessionMessages } from './structured-agent-session-message-projection'
import { nativeChatBotCommunicationTurns } from './native-chat-bot-communication-turns'
import type { createNativeBotCommunicationProjection } from './native-bot-communications'

export function botCommunicationReplies(
  sessionId: string,
  entries: readonly BotCommunication[],
  state: StructuredAgentSessionState,
  native?: {
    environmentId: string
    bots: readonly ProjectChannel[]
    project: ReturnType<typeof createNativeBotCommunicationProjection>
  }
) {
  const items = state.items.filter(isRootAgentJournalItem)
  const messages = projectStructuredAgentSessionMessages(items, [], state.submissions)
  const nativeEntries =
    native?.project(messages, sessionId, native.environmentId, native.bots, state.submissions) ?? []
  const combined = [
    ...new Map([...entries, ...nativeEntries].map((entry) => [entry.id, entry])).values()
  ]
  const { turnKeys } = nativeChatTurnMembership(messages, {
    items,
    submissions: state.submissions,
    latestTurn: state.latestTurn
  })
  const { turns, prompts, mixed } = nativeChatBotCommunicationTurns(
    combined,
    sessionId,
    messages,
    turnKeys,
    state.submissions,
    items
  )
  return {
    nativeEntries,
    found: new Set([...prompts.values()].map((entry) => entry.id)),
    mixed: new Set([...mixed].flatMap((key) => turns.get(key)?.id ?? [])),
    replies: messages.flatMap((message, index) => {
      const key = turnKeys[index]
      const entry = key ? turns.get(key) : undefined
      return key &&
        entry &&
        !mixed.has(key) &&
        message.role === 'assistant' &&
        message.blocks.some(
          (block) =>
            (block.type === 'text' && block.text.trim().length > 0) || block.type === 'image-ref'
        )
        ? [{ entry, message }]
        : []
    })
  }
}
