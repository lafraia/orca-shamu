import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type {
  ProjectChannel,
  ProjectChannelMember,
  ProjectChannelMessage
} from '../../../../shared/project-channels'
import { changeProjectChannel } from './project-channel-store'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import {
  nativeChatTurnMembership,
  type NativeChatTurnJournal
} from '../../../../shared/native-chat/transcript/native-chat-turn-membership'

type ChannelJournal = NativeChatTurnJournal & { epoch?: string }

function comparePosition(
  a: { sequence: number; index: number },
  b: { sequence: number; index: number }
): number {
  return a.sequence - b.sequence || a.index - b.index
}

export function projectChannelText(message: NativeChatMessage): string {
  return message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')
}

export function reconcileProjectChannelMessages(
  channel: ProjectChannel,
  member: ProjectChannelMember,
  messages: readonly NativeChatMessage[],
  journal?: ChannelJournal
): ProjectChannel {
  const first = !member.historyImported
  const baseline = new Set(member.baseline)
  const epoch = journal?.epoch ?? ''
  const boundary = first
    ? messages.reduce<typeof member.historyBoundary>(
        (latest, row) =>
          row.journalPosition && (!latest || comparePosition(row.journalPosition, latest) > 0)
            ? row.journalPosition
            : latest,
        undefined
      )
    : member.historyBoundary
  const ownSends = new Set(
    channel.messages.flatMap((row) =>
      row.deliveryIds?.[member.id] ? [row.deliveryIds[member.id]] : []
    )
  )
  const allowed = new Set([...ownSends].map(agentJournalSubmissionKey))
  for (const submission of journal?.submissions ?? []) {
    if (ownSends.has(submission.clientMessageId) && submission.providerItemId) {
      allowed.add(submission.providerItemId)
    }
  }
  const turns = nativeChatTurnMembership(messages, journal).turnKeys
  const existing = new Map(channel.messages.map((message) => [message.id, message]))
  let changed = first
  for (const [index, message] of messages.entries()) {
    const beforeJoin =
      first ||
      (boundary &&
        message.journalPosition &&
        member.historyEpoch === epoch &&
        comparePosition(message.journalPosition, boundary) <= 0) ||
      baseline.has(message.id)
    const imported = Boolean(member.importHistory && beforeJoin)
    const inChannelTurn =
      message.role === 'assistant' && turns[index] !== undefined && allowed.has(turns[index]!)
    if (
      (message.role !== 'assistant' && message.role !== 'user') ||
      (!imported && !inChannelTurn)
    ) {
      continue
    }
    const key = `${member.id}:${message.id}`
    const text = projectChannelText(message)
    if (!text || existing.get(key)?.text === text) {
      continue
    }
    const before = existing.get(key)
    const next: ProjectChannelMessage = {
      id: key,
      role: message.role,
      text,
      memberId: member.id,
      authorName: member.name,
      sourceId: message.id,
      ...(message.journalPosition ? { sourceOrder: message.journalPosition } : {}),
      createdAt: before?.createdAt ?? message.timestamp ?? Date.now(),
      ...(imported ? { imported: true } : {})
    }
    existing.set(key, next)
    changed = true
  }
  if (!changed) {
    return channel
  }
  return {
    ...channel,
    members: first
      ? channel.members.map((row) =>
          row.id === member.id
            ? {
                ...row,
                historyImported: true,
                historyBoundary: boundary,
                historyEpoch: epoch,
                baseline: messages.map((message) => message.id)
              }
            : row
        )
      : channel.members,
    messages: [...existing.values()].sort((a, b) => {
      if (a.imported && b.imported && a.memberId === b.memberId && a.sourceOrder && b.sourceOrder) {
        return comparePosition(a.sourceOrder, b.sourceOrder)
      }
      return Number(Boolean(b.imported)) - Number(Boolean(a.imported)) || a.createdAt - b.createdAt
    })
  }
}

const pending = new Map<
  string,
  {
    messages: readonly NativeChatMessage[]
    journal?: ChannelJournal
    timer: ReturnType<typeof setTimeout>
  }
>()

export function syncProjectChannelMessages(
  channelId: string,
  memberId: string,
  messages: readonly NativeChatMessage[],
  journal?: ChannelJournal
): void {
  const key = JSON.stringify([channelId, memberId])
  const current = pending.get(key)
  if (current) {
    current.messages = messages
    current.journal = journal
    return
  }
  const entry = {
    messages,
    journal,
    timer: setTimeout(() => {
      pending.delete(key)
      void changeProjectChannel(channelId, (channel) => {
        const member = channel.members.find((row) => row.id === memberId)
        return member
          ? reconcileProjectChannelMessages(channel, member, entry.messages, entry.journal)
          : channel
      }).catch(() => {})
    }, 250)
  }
  pending.set(key, entry)
}
