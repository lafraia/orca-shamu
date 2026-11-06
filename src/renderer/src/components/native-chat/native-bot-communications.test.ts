import { describe, expect, it } from 'vitest'
import type { ProjectChannel } from '../../../../shared/project-channels'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { readAgentMessageSource } from '../../../../shared/agent-session/agent-session-message-source'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../../shared/agent-session/structured-agent-session-reducer'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import {
  nativeBotCommunication,
  createNativeBotCommunicationProjection
} from './native-bot-communications'
import { nativeChatBotCommunicationSlots } from './native-chat-bot-communication-slots'
import { buildNativeChatTranscriptSlots } from './native-chat-transcript-slots'
import { botCommunicationReplies } from './bot-communication-replies'
import { botCommunicationPosts } from './bot-communication-posts'

const botSession = 'claude_ceo'
const workspace = 'claude_workspace'
const bots: ProjectChannel[] = [
  {
    id: 'ceo',
    name: 'CEO',
    mainMemberId: 'home',
    draft: '',
    messages: [],
    createdAt: 1,
    home: {
      directory: '/bots/ceo',
      memberId: 'home',
      ready: true,
      createOperationId: 'create',
      createFingerprint: 'fp'
    },
    members: [
      {
        id: 'home',
        name: 'Claude Chat',
        handle: 'ceo',
        tabId: 'ceo-tab',
        worktreeId: 'ceo-worktree',
        sessionId: botSession,
        agent: 'claude',
        target: { kind: 'environment', environmentId: 'primary' },
        baseline: [],
        historyImported: false,
        importHistory: false
      }
    ]
  }
]
function message(id: string, sender = botSession): NativeChatMessage {
  return {
    id,
    role: 'user',
    source: 'transcript',
    timestamp: 20,
    blocks: [{ type: 'text', text: 'Review the launch' }],
    from: readAgentMessageSource({
      kind: 'agent',
      senders: [
        {
          name: 'Saved workspace title',
          party: {
            address: `orca_session_id:${sender}`,
            orcaSessionId: sender,
            terminalHandle: null
          }
        }
      ],
      orchestration: null
    })
  }
}
const renderItem = (
  id: string,
  sequence: number,
  body: AgentJournalRenderItem['body']
): AgentJournalRenderItem => ({
  itemId: id,
  revision: 1,
  sequence,
  observedAt: sequence * 100,
  body,
  turnScope: { kind: 'turn', turnItemId: 'turn' }
})

describe('native bot and workspace communication', () => {
  it('uses the permanent bot identity on the same environment in either direction', () => {
    const entry = nativeBotCommunication(message('request'), workspace, 'primary', bots)
    expect(entry).toMatchObject({
      actor: 'bot',
      source: { name: 'CEO', botId: 'ceo', sessionId: botSession },
      recipient: { sessionId: workspace }
    })
    expect(entry?.recipient.botId).toBeUndefined()
    expect(
      nativeBotCommunication(message('reverse', workspace), botSession, 'primary', bots)
    ).toMatchObject({
      actor: 'workspace',
      source: { name: 'Saved workspace title', sessionId: workspace },
      recipient: { botId: 'ceo', name: 'CEO' }
    })
    expect(nativeBotCommunication(message('request'), workspace, 'foreign', bots)).toBeNull()
  })
  it('retains unknown, human, federated, multi-sender and native agent start messages', () => {
    const original = message('request')
    expect(
      nativeBotCommunication({ ...original, from: undefined }, workspace, 'primary', bots)
    ).toBeNull()
    expect(
      nativeBotCommunication(message('unknown', 'claude_unknown'), workspace, 'primary', bots)
    ).toBeNull()
    expect(
      nativeBotCommunication({ ...original, agentStart: true }, workspace, 'primary', bots)
    ).toBeNull()
    expect(
      nativeBotCommunication({ ...original, agentId: 'child-agent' }, workspace, 'primary', bots)
    ).toBeNull()
    const from = original.from!
    expect(
      nativeBotCommunication(
        { ...original, from: { ...from, senders: [...from.senders, ...from.senders] } },
        workspace,
        'primary',
        bots
      )
    ).toBeNull()
    expect(
      nativeBotCommunication(
        {
          ...original,
          from: {
            ...from,
            senders: [
              {
                ...from.senders[0],
                party: { ...from.senders[0].party, address: 'dispatch:foreign' }
              }
            ]
          }
        },
        workspace,
        'primary',
        bots
      )
    ).toBeNull()
  })
  it('collapses native internal turns while preserving approvals and a human steer', () => {
    const prompt = message('request')
    const answer: NativeChatMessage = {
      ...prompt,
      id: 'answer',
      role: 'assistant',
      from: undefined
    }
    const approval: NativeChatMessage = {
      ...prompt,
      id: 'approval',
      role: 'system',
      from: undefined
    }
    const entries = createNativeBotCommunicationProjection()([prompt], workspace, 'primary', bots)
    const rows = {
      messages: [prompt, answer, approval],
      turnKeys: ['turn', 'turn', 'turn'],
      liveTurnKey: 'turn'
    }
    const slots = buildNativeChatTranscriptSlots({
      ...rows,
      receipts: new Map(),
      turnStatuses: { active: null, completedByTurn: {} },
      turnDiffs: new Map(),
      expandedTurnKeys: new Set(),
      isWorking: true,
      lifecycleWorking: true
    })
    const view = nativeChatBotCommunicationSlots(slots, entries, workspace, rows, [], true, [
      'approval'
    ])
    expect([...view.headers.values()]).toMatchObject([{ direction: 'incoming', state: 'working' }])
    expect(view.hiddenMessageIds.has('answer')).toBe(true)
    expect(
      view.slots.some((slot) => slot.kind === 'message' && slot.message.id === 'approval')
    ).toBe(true)
    const human: NativeChatMessage = { ...prompt, id: 'human', from: undefined }
    const mixedRows = {
      ...rows,
      messages: [prompt, human, answer],
      turnKeys: ['turn', 'turn', 'turn']
    }
    const mixedSlots = buildNativeChatTranscriptSlots({
      ...mixedRows,
      receipts: new Map(),
      turnStatuses: { active: null, completedByTurn: {} },
      turnDiffs: new Map(),
      expandedTurnKeys: new Set(),
      isWorking: false,
      lifecycleWorking: false
    })
    const mixed = nativeChatBotCommunicationSlots(
      mixedSlots,
      entries,
      workspace,
      mixedRows,
      [],
      false
    )
    expect(mixed.hiddenMessageIds.has('human')).toBe(false)
    expect(mixed.hiddenMessageIds.has('answer')).toBe(false)
  })
  it('keeps the same delivery id after queue handoff and stable entries during streaming', () => {
    const project = createNativeBotCommunicationProjection()
    const prompt = message('provider-input')
    const submissions = [
      {
        clientMessageId: 'dispatch',
        queuedMessageId: 'queue',
        providerItemId: prompt.id,
        fence: 1,
        payloadFingerprint: '',
        dispatchState: 'accepted' as const,
        reason: null,
        submittedAt: 20,
        resolvedAt: 21
      }
    ]
    const entries = project([prompt], workspace, 'primary', bots, submissions)
    expect(entries[0].id).toBe(
      nativeBotCommunication(message('queue'), workspace, 'primary', bots)?.id
    )
    expect(
      project(
        [prompt, { ...prompt, role: 'assistant', id: 'stream' }],
        workspace,
        'primary',
        bots,
        submissions
      )
    ).toBe(entries)
    const renamed = project(
      [prompt],
      workspace,
      'primary',
      [{ ...bots[0], name: 'New CEO' }],
      submissions
    )
    expect(renamed[0].source.name).toBe('New CEO')
  })
  it('discovers reverse native exchanges without leaking unrelated personal or worker replies', () => {
    const prompt = message('native-request', workspace)
    const state = {
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      status: 'ready' as const,
      items: [
        renderItem(prompt.id, 1, {
          kind: 'message',
          role: 'user',
          blocks: prompt.blocks,
          from: prompt.from
        }),
        renderItem('turn', 2, {
          kind: 'turn',
          turnId: 'provider-turn',
          userItemId: prompt.id,
          state: 'completed'
        }),
        renderItem('reply', 3, {
          kind: 'message',
          role: 'assistant',
          blocks: [{ type: 'text', text: 'The launch is ready' }]
        }),
        {
          ...renderItem('worker', 4, {
            kind: 'message',
            role: 'assistant',
            blocks: [{ type: 'text', text: 'Hidden child' }]
          }),
          agentId: 'child'
        },
        {
          ...renderItem('personal', 5, {
            kind: 'message',
            role: 'assistant',
            blocks: [{ type: 'text', text: 'Personal answer' }]
          }),
          turnScope: { kind: 'turn' as const, turnItemId: 'personal-turn' }
        }
      ]
    }
    const read = botCommunicationReplies(botSession, [], state, {
      environmentId: 'primary',
      bots,
      project: createNativeBotCommunicationProjection()
    })
    expect(read.nativeEntries).toHaveLength(1)
    expect(read.replies.map(({ message: reply }) => reply.id)).toEqual(['reply'])
    const posts = botCommunicationPosts(read.nativeEntries, new Map(), [read])
    expect(posts.map((post) => post.author.sessionId)).toEqual([workspace, botSession])
    expect(JSON.stringify(posts)).not.toContain('Personal answer')
    expect(botCommunicationPosts([], new Map(), [read])).toEqual([])
  })
  it('displays the mail subject and body without transport instructions, retaining images', () => {
    const prompt = message('mail')
    prompt.blocks = [
      {
        type: 'text',
        text: `──── From: CLAUDE_CEO (orca_session_id:claude_ceo) (status) ────\nSubject: Launch\nPlease review\n[Reply: orca orchestration reply --id mail --body "..."]\n${'─'.repeat(60)}`
      },
      { type: 'image-ref', path: '/launch.png', alt: 'Launch' }
    ]
    const entry = nativeBotCommunication(prompt, workspace, 'primary', bots)!
    expect(entry.native?.blocks[0]).toMatchObject({ text: 'Launch\n\nPlease review' })
    expect(entry.native?.blocks[1]).toEqual(prompt.blocks[1])
    expect(prompt.blocks[0]).toMatchObject({ text: expect.stringContaining('[Reply:') })
  })
})
