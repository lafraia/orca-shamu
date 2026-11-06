import { describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
vi.mock('./project-channel-store', () => ({ changeProjectChannel: vi.fn() }))
import { reconcileProjectChannelMessages } from './project-channel-transcript'

function message(
  id: string,
  text: string,
  role: NativeChatMessage['role'] = 'assistant',
  sequence = 10
): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    source: 'transcript',
    timestamp: sequence,
    journalPosition: { sequence, index: 0 }
  }
}

describe('project conversation session projection', () => {
  it('imports the main chat without creating a session or changing its folder', () => {
    const channel = channelFixture()
    const rows = [message('one', 'Question', 'user', 1), message('two', 'Answer', 'assistant', 2)]
    const result = reconcileProjectChannelMessages(channel, channel.members[0], rows)
    expect(result.messages.map((row) => row.text)).toEqual(['Question', 'Answer'])
    expect(result.members[0].sessionId).toBe(channel.members[0].sessionId)
    expect(result.members[0].worktreeId).toBe('folder:project')
    expect(reconcileProjectChannelMessages(result, result.members[0], rows)).toBe(result)
  })

  it('keeps invited history private and revises only replies to channel sends', () => {
    const channel = channelFixture()
    const joined = reconcileProjectChannelMessages(channel, channel.members[1], [
      message('earlier', 'Other task')
    ])
    expect(joined.messages).toEqual([])
    joined.messages.push({
      id: 'send',
      role: 'user',
      text: '@researcher Question',
      createdAt: 11,
      deliveryIds: { researcher: 'operation' }
    })
    const opener = message(agentJournalSubmissionKey('operation'), 'Context', 'user', 11)
    const first = reconcileProjectChannelMessages(joined, joined.members[1], [
      message('earlier', 'Other task'),
      opener,
      message('reply', 'Partial', 'assistant', 12)
    ])
    const final = reconcileProjectChannelMessages(first, first.members[1], [
      message('earlier', 'Other task'),
      opener,
      message('reply', 'Complete', 'assistant', 12)
    ])
    expect(final.messages).toHaveLength(2)
    expect(final.messages[1]).toMatchObject({
      text: 'Complete',
      memberId: 'researcher',
      authorName: 'researcher'
    })
  })

  it('does not echo agent context envelopes into the shared chat', () => {
    const channel = channelFixture()
    channel.members[0].historyImported = true
    channel.messages.push({
      id: 'shared',
      role: 'user',
      text: 'Question',
      createdAt: 1,
      deliveryIds: { coordinator: 'operation' }
    })
    const result = reconcileProjectChannelMessages(channel, channel.members[0], [
      message(agentJournalSubmissionKey('operation'), 'Context envelope', 'user'),
      message('reply', 'Answer')
    ])
    expect(result.messages.map((row) => row.text)).toEqual(['Question', 'Answer'])
  })

  it('does not publish private pages loaded later or turns from the original composer', () => {
    const channel = channelFixture()
    const joined = reconcileProjectChannelMessages(channel, channel.members[1], [
      message('tail', 'Private tail')
    ])
    const paged = reconcileProjectChannelMessages(joined, joined.members[1], [
      message('old', 'Private older page', 'assistant', 1),
      message('tail', 'Private tail'),
      message('external', 'Private direct conversation', 'assistant', 12)
    ])
    expect(paged.messages).toEqual([])
  })

  it('imports both sides of earlier main-chat pages in journal order', () => {
    const channel = channelFixture()
    const first = reconcileProjectChannelMessages(channel, channel.members[0], [
      message('recent-user', 'Recent question', 'user', 10),
      message('recent-answer', 'Recent answer', 'assistant', 11)
    ])
    const older = reconcileProjectChannelMessages(first, first.members[0], [
      message('old-user', 'Old question', 'user', 1),
      message('old-answer', 'Old answer', 'assistant', 2),
      message('recent-user', 'Recent question', 'user', 10),
      message('recent-answer', 'Recent answer', 'assistant', 11)
    ])
    expect(older.messages.map((row) => row.text)).toEqual([
      'Old question',
      'Old answer',
      'Recent question',
      'Recent answer'
    ])
  })
})
