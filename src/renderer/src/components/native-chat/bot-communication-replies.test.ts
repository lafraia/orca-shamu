import { describe, expect, it } from 'vitest'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../../shared/agent-session/structured-agent-session-reducer'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import type { BotCommunication } from '../../../../shared/bot-communications'
import { botMentionPrompt } from '../../../../shared/bot-mentions'
import { botCommunicationReplies } from './bot-communication-replies'

const entry: BotCommunication = {
  id: 'reference:dev',
  referenceId: 'cbe8f90b-af62-4ee2-9323-28c09f0d6001',
  environmentId: 'primary',
  createdAt: 20,
  actor: 'bot',
  state: 'recorded',
  source: { name: 'CEO', sessionId: 'ceo' },
  recipient: {
    botId: 'dev',
    name: 'Dev',
    sessionId: 'dev',
    operationId: '1793881751287-0123456789abcdef0123456789abcdef'
  }
}
const item = (
  id: string,
  sequence: number,
  body: AgentJournalRenderItem['body'],
  turnItemId = 'turn'
): AgentJournalRenderItem => ({
  itemId: id,
  revision: 1,
  sequence,
  observedAt: sequence * 100,
  body,
  turnScope: { kind: 'turn', turnItemId }
})
const prompt = item('provider-input', 1, {
  kind: 'message',
  role: 'user',
  blocks: [
    {
      type: 'text',
      text: botMentionPrompt(
        {
          id: entry.referenceId,
          botIds: ['dev'],
          text: 'Review the launch',
          source: { environmentId: 'primary', sessionId: 'ceo', label: 'CEO' }
        },
        { id: 'dev', name: 'Dev' }
      )
    }
  ]
})
const turn = item('turn', 2, {
  kind: 'turn',
  turnId: 'provider-turn',
  userItemId: prompt.itemId,
  state: 'completed'
})
const answer = item('bot-answer', 3, {
  kind: 'message',
  role: 'assistant',
  blocks: [{ type: 'text', text: 'The launch is ready' }]
})
const submission: AgentJournalSubmission = {
  clientMessageId: 'queue-handoff',
  queuedMessageId: entry.recipient.operationId,
  providerItemId: prompt.itemId,
  fence: 1,
  payloadFingerprint: '',
  dispatchState: 'accepted',
  reason: null,
  submittedAt: 20,
  resolvedAt: 21
}

describe('the internal communication reader', () => {
  it('uses native turn scopes and queue handoff aliases without including unrelated or subagent replies', () => {
    const unrelated = item(
      'other-answer',
      5,
      {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'Private answer to the person' }]
      },
      'other-turn'
    )
    const child = { ...answer, itemId: 'child', agentId: 'child-agent' }
    const view = botCommunicationReplies('dev', [entry], {
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      status: 'ready',
      items: [prompt, turn, answer, child, unrelated],
      submissions: [submission]
    })
    expect(view.replies.map(({ message }) => message.id)).toEqual([answer.itemId])
    expect(view.found.has(entry.id)).toBe(true)
  })
  it('can attribute an answer in a partial history page before the opener has loaded', () => {
    const view = botCommunicationReplies('dev', [entry], {
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      status: 'ready',
      hasOlder: true,
      items: [turn, answer],
      submissions: [submission]
    })
    expect(view.replies.map(({ message }) => message.id)).toEqual([answer.itemId])
    expect(view.found.has(entry.id)).toBe(false)
  })
  it('does not present a response to a human steer as a private bot reply', () => {
    const steer = item('human-steer', 3, {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'Answer me directly' }]
    })
    const view = botCommunicationReplies('dev', [entry], {
      ...EMPTY_STRUCTURED_AGENT_SESSION,
      status: 'ready',
      items: [prompt, turn, steer, answer],
      submissions: [submission]
    })
    expect(view.mixed.has(entry.id)).toBe(true)
    expect(view.replies).toEqual([])
  })
})
