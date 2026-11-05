import { describe, expect, it } from 'vitest'
import { botMentionPrompt } from '../../../../shared/bot-mentions'
import type { BotCommunication } from '../../../../shared/bot-communications'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { AgentJournalSubmission } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import { buildNativeChatTranscriptSlots } from './native-chat-transcript-slots'
import { createNativeChatBotCommunicationProjection } from './native-chat-bot-communication-slots'

const referenceId = 'cbe8f90b-af62-4ee2-9323-28c09f0d6001'
const operationId = '1793881751287-0123456789abcdef0123456789abcdef'
const entry: BotCommunication = {
  id: `${referenceId}:dev`,
  referenceId,
  environmentId: 'primary',
  createdAt: 20,
  actor: 'bot',
  state: 'recorded',
  source: { botId: 'ceo', name: 'CEO', sessionId: 'ceo-session', itemId: 'human' },
  recipient: { botId: 'dev', name: 'Dev: Vagalume', sessionId: 'dev-session', operationId }
}
const prompt = botMentionPrompt(
  {
    id: referenceId,
    botIds: ['dev'],
    text: 'Review the launch',
    source: { environmentId: 'primary', sessionId: 'ceo-session', label: 'CEO' }
  },
  { id: 'dev', name: 'Dev: Vagalume' }
)
const message = (id: string, role: NativeChatMessage['role'], text: string): NativeChatMessage => ({
  id,
  role,
  source: 'transcript',
  timestamp: 10,
  blocks: [{ type: 'text', text }]
})
const submission = (
  clientMessageId: string,
  providerItemId: string,
  queuedMessageId?: string
): AgentJournalSubmission => ({
  clientMessageId,
  providerItemId,
  ...(queuedMessageId ? { queuedMessageId } : {}),
  fence: 1,
  payloadFingerprint: '',
  dispatchState: 'accepted',
  reason: null,
  submittedAt: 20,
  resolvedAt: 21
})
function project(
  messages: NativeChatMessage[],
  turnKeys: string[],
  sessionId = 'dev-session',
  submissions: AgentJournalSubmission[] = [],
  working = false
) {
  const rows = { messages, turnKeys, liveTurnKey: working ? turnKeys.at(-1) : undefined }
  const slots = buildNativeChatTranscriptSlots({
    ...rows,
    receipts: new Map(),
    turnStatuses: { active: null, completedByTurn: {} },
    turnDiffs: new Map(),
    expandedTurnKeys: new Set(),
    isWorking: working,
    lifecycleWorking: working
  })
  return createNativeChatBotCommunicationProjection()(
    slots,
    [entry],
    sessionId,
    rows,
    submissions,
    working
  )
}

describe('bot communication transcript separation', () => {
  it('keeps human messages and replaces an internal prompt and answer with one compact row', () => {
    const id = agentJournalSubmissionKey(operationId)
    const view = project(
      [
        message('human', 'user', 'My own message'),
        message('answer', 'assistant', 'My own answer'),
        message(id, 'user', prompt),
        message('private-reply', 'assistant', 'Internal bot reply')
      ],
      ['human', 'human', id, id]
    )
    const text = JSON.stringify(view.slots)
    expect(text).toContain('My own message')
    expect(text).toContain('My own answer')
    expect(text).not.toContain('The user mentioned you')
    expect(text).not.toContain('Internal bot reply')
    expect([...view.headers.values()]).toMatchObject([{ direction: 'incoming', state: 'replied' }])
    expect(view.hiddenPromptIds.has(id)).toBe(true)
  })
  it('follows a queued draft into a distinct provider submission and retains live status', () => {
    const view = project(
      [
        message('provider-user', 'user', prompt),
        message('work', 'reasoning', 'Internal reasoning')
      ],
      ['provider-user', 'provider-user'],
      'dev-session',
      [submission('new-dispatch', 'provider-user', operationId)],
      true
    )
    expect(view.slots).toHaveLength(1)
    expect(view.hiddenLiveTurn).toBe(true)
    expect([...view.headers.values()][0].state).toBe('working')
  })
  it('never hides a human steer or guesses that a pasted notification was a bot send', () => {
    const id = agentJournalSubmissionKey(operationId)
    const mixed = project(
      [
        message(id, 'user', prompt),
        message('steer', 'user', 'Answer me directly'),
        message('response', 'assistant', 'A shared response')
      ],
      [id, id, id]
    )
    expect(JSON.stringify(mixed.slots)).toContain('Answer me directly')
    expect(JSON.stringify(mixed.slots)).toContain('A shared response')
    const pasted = project([message('pasted-by-user', 'user', prompt)], ['pasted-by-user'])
    expect(pasted.headers.size).toBe(0)
    expect(JSON.stringify(pasted.slots)).toContain('The user mentioned you')
  })
  it('shows outgoing communication next to its source without suppressing the bot reply to the person', () => {
    const view = project(
      [message('human', 'user', 'Ask Dev to review'), message('reply', 'assistant', 'I asked Dev')],
      ['human', 'human'],
      'ceo-session'
    )
    expect(JSON.stringify(view.slots)).toContain('I asked Dev')
    expect([...view.headers.values()]).toMatchObject([{ direction: 'outgoing', state: 'sent' }])
  })
  it('keeps row context stable while an internal answer streams', () => {
    const id = agentJournalSubmissionKey(operationId)
    const messages = [message(id, 'user', prompt)]
    const rows = { messages, turnKeys: [id], liveTurnKey: id }
    const slots = buildNativeChatTranscriptSlots({
      ...rows,
      receipts: new Map(),
      turnStatuses: { active: null, completedByTurn: {} },
      turnDiffs: new Map(),
      expandedTurnKeys: new Set(),
      isWorking: true,
      lifecycleWorking: true
    })
    const render = createNativeChatBotCommunicationProjection()
    const first = render(slots, [entry], 'dev-session', rows, [], true)
    const next = render(
      slots,
      [entry],
      'dev-session',
      {
        ...rows,
        messages: [...messages, message('reply', 'assistant', 'Streaming')],
        turnKeys: [id, id]
      },
      [],
      true
    )
    expect(next.headers).toBe(first.headers)
  })
})
