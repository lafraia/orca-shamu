import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { botControlFixture } from './bot-control.test-fixture'
import { readBotCliResult } from './bot-cli-result'
import type { BotCliReceipt } from '../../shared/bot-cli-prompts'

let fixture: Awaited<ReturnType<typeof botControlFixture>>
beforeEach(async () => {
  fixture = await botControlFixture()
})
afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

it('reads only the requested queued turn response, omitting unrelated and child replies', async () => {
  const receipt: BotCliReceipt = {
    version: 1,
    request: {
      action: 'send',
      requestId: '03ccf76b-ce2a-461f-9647-a18ee14d6bb9',
      bot: 'actor',
      sender: 'Grokbot',
      text: 'Target request'
    },
    fingerprint: 'fingerprint',
    botId: 'actor',
    botName: 'Coordinator',
    sessionId: 'session-actor',
    environmentId: 'primary',
    operationId: '1790000000000-12345678123412341234123456781234',
    messageId: 'queued-target',
    prompt: 'Target request',
    state: 'queued',
    createdAt: 10
  }
  fixture.submissions.set('session-actor', [
    {
      clientMessageId: 'sent-target',
      queuedMessageId: 'queued-target',
      fence: 7,
      payloadFingerprint: 'fingerprint',
      dispatchState: 'accepted',
      providerItemId: 'native-user',
      reason: null,
      submittedAt: 10,
      resolvedAt: 11
    }
  ])
  fixture.journals.set('session-actor', [
    {
      itemId: 'target-turn',
      revision: 1,
      sequence: 2,
      observedAt: 11,
      body: {
        kind: 'turn',
        turnId: 'turn-target',
        state: 'completed',
        outcome: 'success',
        userItemId: 'native-user'
      }
    },
    {
      itemId: 'reply',
      revision: 1,
      sequence: 3,
      observedAt: 12,
      turnScope: { kind: 'turn', turnItemId: 'target-turn' },
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'The requested answer.' }]
      }
    },
    {
      itemId: 'child',
      revision: 1,
      sequence: 4,
      observedAt: 13,
      agentId: 'child',
      turnScope: { kind: 'turn', turnItemId: 'target-turn' },
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'A child internal reply.' }]
      }
    },
    {
      itemId: 'unrelated',
      revision: 1,
      sequence: 5,
      observedAt: 14,
      turnScope: { kind: 'turn', turnItemId: 'other-turn' },
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'A different conversation request.' }]
      }
    }
  ])
  expect(await readBotCliResult(fixture.primary, receipt)).toMatchObject({
    requestId: '03ccf76b-ce2a-461f-9647-a18ee14d6bb9',
    state: 'completed',
    response: 'The requested answer.',
    truncated: false
  })
})
