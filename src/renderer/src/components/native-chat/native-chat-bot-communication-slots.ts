import type { BotCommunication } from '../../../../shared/bot-communications'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import type { NativeChatTurnRows } from './use-native-chat-turn-membership'
import type {
  NativeChatMessageSlot,
  NativeChatTranscriptSlot
} from './native-chat-transcript-slots'
import { nativeChatBotCommunicationTurns } from './native-chat-bot-communication-turns'

export type BotCommunicationRowState =
  | 'sending'
  | 'sent'
  | 'working'
  | 'replied'
  | 'queued'
  | 'refused'
  | 'unconfirmed'
export type BotCommunicationRow = {
  entry: BotCommunication
  direction: 'incoming' | 'outgoing'
  state: BotCommunicationRowState
}
export const communicationDeliveryState = (entry: BotCommunication): BotCommunicationRowState =>
  entry.state === 'ready' || entry.state === 'issued'
    ? 'sending'
    : entry.state === 'recorded'
      ? 'sent'
      : entry.state

function communicationSlot(
  entry: BotCommunication,
  direction: 'incoming' | 'outgoing'
): NativeChatMessageSlot {
  return {
    kind: 'message',
    message: {
      id: `shamu-communication:${direction}:${entry.id}`,
      role: 'system',
      source: 'transcript',
      timestamp: entry.createdAt,
      blocks: []
    },
    turnKey: undefined,
    activeTurnIsWorking: false,
    trailingRun: false,
    receipt: undefined,
    status: undefined,
    folded: false,
    drawsMessage: true,
    turnFolds: false,
    turnDiff: undefined,
    subagentRoster: undefined,
    depth: 0,
    estimatedHeight: entry.cli ? 120 : 40
  }
}

export function nativeChatBotCommunicationSlots(
  slots: readonly NativeChatTranscriptSlot[],
  entries: readonly BotCommunication[],
  sessionId: string,
  rows: NativeChatTurnRows,
  submissions: readonly AgentJournalSubmission[],
  isWorking: boolean,
  actionablePromptIds?: readonly string[],
  journalItems?: readonly AgentJournalRenderItem[]
) {
  const { prompts, turns, mixed } = nativeChatBotCommunicationTurns(
    entries,
    sessionId,
    rows.messages,
    rows.turnKeys,
    submissions,
    journalItems
  )
  const hiddenPromptIds = new Set<string>()
  const hiddenMessageIds = new Set<string>()
  const headers = new Map<string, BotCommunicationRow>()
  const drawn = new Set<string>()
  const output: NativeChatTranscriptSlot[] = []
  const replies = new Set(
    rows.messages.flatMap((message, index) =>
      message.role === 'assistant' &&
      message.blocks.some(
        (block) =>
          (block.type === 'text' && block.text.trim().length > 0) || block.type === 'image-ref'
      ) &&
      rows.turnKeys[index]
        ? [rows.turnKeys[index]!]
        : []
    )
  )
  const append = (
    entry: BotCommunication,
    direction: 'incoming' | 'outgoing',
    key?: string
  ): void => {
    if (drawn.has(entry.id)) {
      return
    }
    const slot = communicationSlot(entry, direction)
    const state =
      key && key === rows.liveTurnKey && isWorking
        ? 'working'
        : key && replies.has(key)
          ? 'replied'
          : communicationDeliveryState(entry)
    headers.set(slot.message.id, { entry, direction, state })
    output.push(slot)
    drawn.add(entry.id)
  }
  for (const slot of slots) {
    const incoming = slot.kind === 'message' ? prompts.get(slot.message.id) : undefined
    const turn = slot.turnKey ? turns.get(slot.turnKey) : undefined
    if (incoming || (turn && !turn.cli && !mixed.has(slot.turnKey!))) {
      append(incoming ?? turn!, 'incoming', slot.turnKey)
      if (slot.kind === 'message' && actionablePromptIds?.includes(slot.message.id)) {
        output.push(slot)
      }
      continue
    }
    output.push(slot)
  }
  const outgoing = entries.filter((entry) => entry.source.sessionId === sessionId)
  for (const entry of outgoing) {
    const anchor = entry.source.itemId
    const at = anchor
      ? output.findLastIndex(
          (slot) =>
            slot.kind === 'message' &&
            (slot.message.id === anchor ||
              slot.turnKey === anchor ||
              headers.get(slot.message.id)?.entry.source.itemId === anchor)
        )
      : -1
    if (at < 0) {
      const firstAt = slots.find(
        (slot) => slot.kind === 'message' && slot.message.timestamp !== null
      )
      if (firstAt?.kind === 'message' && entry.createdAt < firstAt.message.timestamp!) {
        continue
      }
    }
    const slot = communicationSlot(entry, 'outgoing')
    headers.set(slot.message.id, {
      entry,
      direction: 'outgoing',
      state: communicationDeliveryState(entry)
    })
    const insertion =
      at >= 0
        ? at + 1
        : output.findIndex(
            (row) => row.kind === 'message' && (row.message.timestamp ?? 0) > entry.createdAt
          )
    output.splice(insertion < 0 ? output.length : insertion, 0, slot)
  }
  rows.messages.forEach((message, index) => {
    const key = rows.turnKeys[index]
    if (
      prompts.has(message.id) ||
      (key && turns.has(key) && !turns.get(key)?.cli && !mixed.has(key))
    ) {
      hiddenMessageIds.add(message.id)
      if (message.role === 'user') {
        hiddenPromptIds.add(message.id)
      }
    }
  })
  const hiddenLiveTurn =
    rows.liveTurnKey !== undefined &&
    turns.has(rows.liveTurnKey) &&
    !turns.get(rows.liveTurnKey)?.cli &&
    !mixed.has(rows.liveTurnKey)
  return { slots: output, headers, hiddenLiveTurn, hiddenMessageIds, hiddenPromptIds }
}

const EMPTY_IDS: ReadonlySet<string> = new Set()
const EMPTY_HEADERS: ReadonlyMap<string, BotCommunicationRow> = new Map()
export function createNativeChatBotCommunicationProjection() {
  let headers = EMPTY_HEADERS
  return (...args: Parameters<typeof nativeChatBotCommunicationSlots>) => {
    if (!args[1].length) {
      return {
        slots: args[0],
        headers: EMPTY_HEADERS,
        hiddenLiveTurn: false,
        hiddenMessageIds: EMPTY_IDS,
        hiddenPromptIds: EMPTY_IDS
      }
    }
    const next = nativeChatBotCommunicationSlots(...args)
    if (
      headers.size !== next.headers.size ||
      [...next.headers].some(([id, row]) => {
        const prior = headers.get(id)
        return (
          prior?.entry !== row.entry ||
          prior.direction !== row.direction ||
          prior.state !== row.state
        )
      })
    ) {
      headers = next.headers
    }
    return { ...next, headers }
  }
}
