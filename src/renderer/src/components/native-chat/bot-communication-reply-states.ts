import type { BotCommunication } from '../../../../shared/bot-communications'
import type { StructuredAgentSessionState } from '../../../../shared/agent-session/structured-agent-session-reducer'
import { isRootAgentJournalItem } from '../../../../shared/agent-session/journal/agent-session-journal-producer'
import {
  readAgentJournalTurn,
  readAgentJournalTurnOutcome
} from '../../../../shared/agent-session/lifecycle/agent-session-turn-record'
import {
  communicationDeliveryState,
  type BotCommunicationRowState
} from './native-chat-bot-communication-slots'

export function botCommunicationReplyStates(
  sessionId: string,
  entries: readonly BotCommunication[],
  state: StructuredAgentSessionState,
  turns: ReadonlyMap<string, BotCommunication>,
  mixed: ReadonlySet<string>,
  replied: readonly string[]
): ReadonlyMap<string, BotCommunicationRowState> {
  const states = new Map<string, BotCommunicationRowState>()
  const items = state.items.filter(isRootAgentJournalItem)
  for (const entry of entries) {
    if (entry.recipient.sessionId !== sessionId) {
      continue
    }
    let status = communicationDeliveryState(entry)
    if (entry.state === 'recorded') {
      const queued = state.queuedMessages?.find(
        (message) =>
          message.messageId === (entry.recipient.messageId ?? entry.recipient.operationId)
      )
      const item = items.findLast(
        (row) => readAgentJournalTurn(row.body) && turns.get(row.itemId)?.id === entry.id
      )
      const turn = readAgentJournalTurn(item?.body)
      const outcome = readAgentJournalTurnOutcome(turn)
      if (state.status === 'error' || (item && mixed.has(item.itemId))) {
        status = 'unconfirmed'
      } else if (queued) {
        status = queued.state === 'waiting' ? 'queued' : 'unconfirmed'
      } else if (turn?.state === 'running') {
        const needsInput = items.some(
          (row) =>
            row.turnScope?.kind === 'turn' &&
            row.turnScope.turnItemId === item?.itemId &&
            (row.body.kind === 'approval' || row.body.kind === 'question') &&
            row.body.resolution.state === 'pending' &&
            (state.actionablePromptIds === undefined ||
              state.actionablePromptIds.includes(row.itemId))
        )
        status = needsInput ? 'waiting' : 'working'
      } else if (turn?.state === 'interrupted' || (outcome && outcome !== 'success')) {
        status = 'failed'
      } else if (turn) {
        status =
          turn.state === 'completed' && outcome === 'success' && replied.includes(entry.id)
            ? 'replied'
            : 'unconfirmed'
      } else if (state.status === 'ready') {
        status = 'unconfirmed'
      }
    }
    states.set(entry.id, status)
  }
  return states
}
