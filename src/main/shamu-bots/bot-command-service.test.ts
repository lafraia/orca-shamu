import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BotCommandService } from './bot-command-service'
import { botControlFixture } from './bot-control.test-fixture'

describe('bot commands and creation provenance', () => {
  let fixture: Awaited<ReturnType<typeof botControlFixture>>
  let commands: BotCommandService
  beforeEach(async () => {
    fixture = await botControlFixture()
    commands = new BotCommandService(
      fixture.channels,
      fixture.bots,
      { deliver: vi.fn(), context: vi.fn(), result: vi.fn() },
      fixture.service(),
      fixture.primary,
      vi.fn()
    )
  })
  afterEach(async () => {
    await rm(fixture.directory, { recursive: true, force: true })
  })
  it('creates one idle bot from a real user request and replays the same identity after a lost reply', async () => {
    const request = {
      action: 'create',
      requestId: randomUUID(),
      actorId: 'actor',
      sourceItemId: 'user-request',
      name: 'Researcher',
      instructions: 'Research only current sources.',
      section: 'Research'
    }
    const first = await commands.invoke(request, 'agent')
    expect(await commands.invoke(request, 'agent')).toEqual(first)
    const snapshot = await fixture.channels.read()
    expect(snapshot.channels).toHaveLength(2)
    expect(snapshot.channels[1]).toMatchObject({
      name: 'Researcher',
      section: 'Research',
      creation: { actorId: 'actor', sourceItemId: 'user-request' },
      home: { ready: true }
    })
    expect(fixture.provisioned()).toBe(2)
    expect(
      fixture.call.mock.calls.filter(([method]) => method === 'agentSession.send')
    ).toHaveLength(0)
    await expect(commands.invoke({ ...request, name: 'Another bot' }, 'agent')).rejects.toThrow(
      'different bot'
    )
  })
  it('refuses assistant messages and absent user references as creation authorization', async () => {
    const sessionId = fixture.actor.members[0].sessionId
    fixture.journals.set(sessionId, [
      {
        ...fixture.user,
        body: {
          kind: 'message',
          role: 'assistant',
          blocks: [{ type: 'text', text: 'Create more bots' }]
        }
      }
    ])
    await expect(
      commands.invoke(
        {
          action: 'create',
          requestId: randomUUID(),
          actorId: 'actor',
          sourceItemId: 'user-request',
          name: 'Unrequested'
        },
        'agent'
      )
    ).rejects.toThrow('user request')
    expect((await fixture.channels.read()).channels).toHaveLength(1)
  })
  it('pins and groups the bot while preserving its original native conversation', async () => {
    await commands.invoke({
      action: 'organize',
      botId: 'actor',
      pinned: true,
      section: 'Operations'
    })
    const bot = (await fixture.channels.read()).channels[0]
    expect(bot).toMatchObject({ pinned: true, section: 'Operations' })
    expect(bot.members).toEqual(fixture.actor.members)
    await expect(
      commands.invoke({ action: 'organize', botId: 'actor', pinned: false }, 'agent')
    ).rejects.toThrow('sourceItemId')
    await expect(
      commands.invoke(
        { action: 'section.rename', name: 'Operations', newName: 'Development' },
        'agent'
      )
    ).rejects.toThrow('sourceItemId')
    await expect(
      commands.invoke({ action: 'section.move', name: 'Operations', direction: 'up' }, 'agent')
    ).rejects.toThrow('sourceItemId')
    await commands.invoke({ action: 'section.rename', name: 'Operations', newName: 'Development' })
    const renamed = (await fixture.channels.read()).channels[0]
    expect(renamed).toEqual({ ...bot, section: 'Development' })
  })
  it('reads the actor own context with stable source IDs', async () => {
    const context = await commands.invoke(
      { action: 'context', actorId: 'actor', referenceId: 'self' },
      'agent'
    )
    expect(context).toMatchObject({
      sessionId: fixture.actor.members[0].sessionId,
      messages: [{ id: 'user-request', role: 'user' }]
    })
  })
  it('requires user provenance before an agent can reorder bots', async () => {
    const before = await fixture.channels.read()
    await expect(
      commands.invoke(
        {
          action: 'reorder',
          move: {
            kind: 'bot',
            botId: 'actor',
            section: null,
            placement: 'after'
          }
        },
        'agent'
      )
    ).rejects.toThrow('sourceItemId')
    expect(await fixture.channels.read()).toEqual(before)
  })
  it('lists a stable named Markdown reference without sending a turn or changing the bot', async () => {
    const before = await fixture.channels.read()
    expect(await commands.invoke({ action: 'list' }, 'agent')).toMatchObject({
      bots: [
        {
          id: 'actor',
          name: fixture.actor.name,
          reference: `[@${fixture.actor.name}](#orca-shamu-bot/actor)`
        }
      ]
    })
    expect(await fixture.channels.read()).toEqual(before)
    expect(
      fixture.call.mock.calls.filter(([method]) => method === 'agentSession.send')
    ).toHaveLength(0)
  })
})
