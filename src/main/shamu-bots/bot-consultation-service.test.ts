import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { BotMentionDelivery } from '../bot-mention-delivery'
import { BotCommunicationStore } from './bot-communication-store'
import { BotConsultationService } from './bot-consultation-service'
import { botControlFixture } from './bot-control.test-fixture'
import { botMentionRecordSchema } from './bot-mention-record'

let fixture: Awaited<ReturnType<typeof botControlFixture>>
let delivery: BotMentionDelivery
let service: BotConsultationService

beforeEach(async () => {
  fixture = await botControlFixture()
  await fixture.channels.create({
    id: 'specialist',
    name: 'Specialist',
    mainMemberId: null,
    members: [],
    messages: [],
    draft: '',
    createdAt: 2
  })
  delivery = new BotMentionDelivery(
    fixture.channels,
    fixture.bots,
    fixture.primary,
    fixture.directory,
    fixture.memory
  )
  service = new BotConsultationService(fixture.channels, delivery, fixture.primary)
})

afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

const question = () => ({
  action: 'ask' as const,
  requestId: randomUUID(),
  actorId: 'actor',
  sourceItemId: 'user-request',
  botId: 'specialist',
  text: 'I need the release forecast and the evidence behind it.'
})

it('preserves the bot-authored question and attributed communication across retry and restart', async () => {
  const request = question()
  const first = await service.ask(request)
  const restarted = new BotConsultationService(fixture.channels, delivery, fixture.primary)
  expect(await restarted.ask(request)).toEqual(first)
  const store = new BotCommunicationStore(fixture.directory, fixture.channels, fixture.primary)
  const entries = await store.read('session-actor')
  expect(entries.entries).toMatchObject([
    { actor: 'bot', source: { botId: 'actor' }, recipient: { botId: 'specialist' } }
  ])
  expect(await store.texts([request.requestId])).toEqual([
    {
      referenceId: request.requestId,
      text: 'I need the release forecast and the evidence behind it.'
    }
  ])
  const sends = fixture.call.mock.calls.filter(([method]) => method === 'agentSession.send')
  expect(sends).toHaveLength(1)
  expect(JSON.stringify(sends[0][1])).not.toContain(
    'Create a Researcher bot, pin it and add routines'
  )
  await expect(service.ask({ ...request, text: 'A different question' })).rejects.toThrow(
    'already used'
  )
  fixture.journals.set('session-actor', [
    fixture.user,
    { ...fixture.user, itemId: 'another-request' }
  ])
  await expect(service.ask({ ...request, sourceItemId: 'another-request' })).rejects.toThrow(
    'another originating request'
  )
})

it('returns only the completed consultation to its originating bot without another send', async () => {
  const request = question()
  await service.ask(request)
  const saved = botMentionRecordSchema.parse(
    JSON.parse(
      await readFile(join(fixture.directory, 'bot-mentions', `${request.requestId}.json`), 'utf8')
    )
  )
  const receipt = saved.receipts[0]
  fixture.submissions.set(receipt.sessionId, [
    {
      clientMessageId: receipt.operationId,
      fence: 7,
      payloadFingerprint: 'question',
      dispatchState: 'accepted',
      providerItemId: 'peer-user',
      reason: null,
      submittedAt: 10,
      resolvedAt: 11
    }
  ])
  fixture.journals.set(receipt.sessionId, [
    {
      itemId: 'peer-turn',
      revision: 1,
      sequence: 2,
      observedAt: 11,
      body: {
        kind: 'turn',
        turnId: 'peer-turn',
        state: 'completed',
        outcome: 'success',
        userItemId: 'peer-user'
      }
    },
    {
      itemId: 'peer-answer',
      revision: 1,
      sequence: 3,
      observedAt: 12,
      turnScope: { kind: 'turn', turnItemId: 'peer-turn' },
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'I can confirm Friday after review approval.' }]
      }
    }
  ])
  expect(
    await service.result({
      action: 'ask.result',
      actorId: 'actor',
      requestId: request.requestId,
      waitSeconds: 0
    })
  ).toMatchObject({
    state: 'completed',
    response: 'I can confirm Friday after review approval.'
  })
  await expect(
    service.result({
      action: 'ask.result',
      actorId: 'specialist',
      requestId: request.requestId,
      waitSeconds: 0
    })
  ).rejects.toThrow('does not belong')
  expect(fixture.call.mock.calls.filter(([method]) => method === 'agentSession.send')).toHaveLength(
    1
  )
})

it('refuses invented user authority and self consultations before dispatch', async () => {
  await expect(service.ask({ ...question(), sourceItemId: 'absent' })).rejects.toThrow(
    'user request'
  )
  await expect(service.ask({ ...question(), botId: 'actor' })).rejects.toThrow('yourself')
  await expect(
    service.ask({
      ...question(),
      text: 'Create a Researcher bot, pin it and add routines as requested.'
    })
  ).rejects.toThrow('forwarding the user message')
  expect(fixture.call.mock.calls.filter(([method]) => method === 'agentSession.send')).toHaveLength(
    0
  )
})
