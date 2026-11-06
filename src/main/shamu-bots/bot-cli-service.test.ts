import { rm, stat } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { botControlFixture } from './bot-control.test-fixture'
import { BotCliService } from './bot-cli-service'
import { BotCliStore } from './bot-cli-store'

describe('external CLI bot prompts', () => {
  let fixture: Awaited<ReturnType<typeof botControlFixture>>
  let service: BotCliService
  const request = {
    action: 'send' as const,
    requestId: 'b18e94d8-98c9-4a31-a117-521d5127eea3',
    bot: 'Coordinator',
    sender: 'Grokbot',
    text: 'Inspect the project and report here.'
  }
  beforeEach(async () => {
    fixture = await botControlFixture()
    service = new BotCliService(
      fixture.channels,
      fixture.bots,
      fixture.memory,
      fixture.primary,
      fixture.directory,
      vi.fn()
    )
  })
  afterEach(async () => {
    await rm(fixture.directory, { recursive: true, force: true })
  })

  it('reuses one durable delivery after restart and retains the existing conversation and draft', async () => {
    await fixture.channels.update('actor', (bot) => ({ ...bot, draft: 'My unfinished message' }))
    const first = await service.send(request)
    const reopened = new BotCliService(
      fixture.channels,
      fixture.bots,
      fixture.memory,
      fixture.primary,
      fixture.directory,
      vi.fn()
    )
    expect((await reopened.send(request)).operationId).toBe(first.operationId)
    expect((await fixture.channels.read()).channels[0]).toMatchObject({
      id: 'actor',
      draft: 'My unfinished message',
      home: fixture.actor.home,
      members: fixture.actor.members
    })
    const rows = await reopened.communications(fixture.actor.members[0].sessionId)
    expect(rows.entries).toMatchObject([
      {
        actor: 'cli',
        cli: { text: 'Inspect the project and report here.', sender: 'Grokbot' },
        recipient: { botId: 'actor', sessionId: 'session-actor', operationId: first.operationId }
      }
    ])
    if (process.platform !== 'win32') {
      expect(
        (await stat(new BotCliStore(fixture.directory).file(request.requestId))).mode & 0o777
      ).toBe(0o600)
    }
    await expect(reopened.send({ ...request, text: 'Another prompt' })).rejects.toThrow(
      'different prompt'
    )
  })

  it('does not resend a delivery whose transport reply was lost', async () => {
    const original = fixture.call.getMockImplementation()!
    fixture.call.mockImplementation(async (method, params) => {
      if (method === 'agentSession.send') {
        throw new Error('Disconnected after dispatch')
      }
      return original(method, params)
    })
    const sent = await service.send(request)
    expect(sent.state).toBe('unconfirmed')
    fixture.call.mockImplementation(async (method, params) => {
      if (method === 'agentSession.send') {
        throw new Error('A second dispatch must not replace uncertainty')
      }
      return original(method, params)
    })
    expect((await service.send(request)).operationId).toBe(sent.operationId)
    expect((await new BotCliStore(fixture.directory).read(request.requestId))?.state).toBe(
      'unconfirmed'
    )
    expect((await new BotCliStore(fixture.directory).read(request.requestId))?.error).toBe(
      'Disconnected after dispatch'
    )
  })

  it('rejects an ambiguous name and a different primary before issuing a prompt', async () => {
    await fixture.channels.create({
      id: 'other',
      name: 'Coordinator',
      mainMemberId: null,
      members: [],
      messages: [],
      draft: '',
      createdAt: 10
    })
    await expect(service.send(request)).rejects.toThrow('unique bot name')
    const sent = await service.send({ ...request, bot: 'actor' })
    expect(sent.botId).toBe('actor')
    fixture.primary.read = async () => ({ environmentId: 'other-primary' })
    await expect(service.result(request.requestId)).rejects.toThrow('another primary')
    await expect(service.send({ ...request, bot: 'actor' })).rejects.toThrow('different prompt')
  })
})
