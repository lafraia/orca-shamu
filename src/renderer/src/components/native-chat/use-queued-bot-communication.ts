import { useContext, useMemo } from 'react'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { readBotTurnPrompt } from '../../../../shared/bot-turn-context'
import type { QueuedMessageCard } from '../../../../shared/agent-session/view/structured-agent-session-queued-cards'
import { nativeBotCommunication } from './native-bot-communications'

export function useQueuedBotCommunication(card: QueuedMessageCard) {
  const context = useContext(BotCommunicationContext)
  const bots = useProjectChannels((state) => state.snapshot.channels)
  const entries = context?.entries
  const sessionId = context?.sessionId
  const environmentId = context?.target.kind === 'environment' ? context.target.environmentId : null
  return useMemo(() => {
    if (!entries || !sessionId) {
      return null
    }
    const text = readBotTurnPrompt(card.text)?.message ?? card.text
    const mention = entries.find(
      (entry) =>
        entry.recipient.operationId === card.messageId &&
        text.includes(`Notification reference: ${entry.referenceId}.`)
    )
    return (
      mention ??
      (environmentId
        ? nativeBotCommunication(
            {
              id: card.messageId,
              role: 'user',
              source: 'transcript',
              timestamp: null,
              blocks: [{ type: 'text', text: card.text }, ...(card.images ?? [])],
              from: card.from
            },
            sessionId,
            environmentId,
            bots
          )
        : null)
    )
  }, [card, entries, sessionId, environmentId, bots])
}
