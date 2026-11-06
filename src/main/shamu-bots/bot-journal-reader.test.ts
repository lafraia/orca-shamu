import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { botControlFixture } from './bot-control.test-fixture'
import { readBotReferenceContext, requireBotUserRequest } from './bot-journal-reader'

describe('bot source context', () => {
  let fixture: Awaited<ReturnType<typeof botControlFixture>>
  beforeEach(async () => {
    fixture = await botControlFixture()
  })
  afterEach(async () => {
    await rm(fixture.directory, { recursive: true, force: true })
  })
  it('bounds serialized messages and keeps a cursor at the actual oldest included message', async () => {
    const session = fixture.actor.members[0].sessionId
    fixture.journals.set(
      session,
      Array.from({ length: 30 }, (_, index) => ({
        ...fixture.user,
        itemId: `message-${index + 1}`,
        sequence: index + 1,
        body: {
          kind: 'message',
          role: 'user',
          blocks: [{ type: 'text', text: `${index}: ${'a'.repeat(9000)}` }]
        }
      }))
    )
    const context = await readBotReferenceContext(fixture.primary, session)
    expect(JSON.stringify(context.messages).length).toBeLessThan(24_100)
    expect(context.hasOlder).toBe(true)
    expect(context.messages.at(-1)).toMatchObject({ id: 'message-30', truncated: true })
    const oldest = context.messages[0]
    expect(context.before?.sequence).toBe(Number(oldest.id.split('-')[1]))
    expect(context.before!.sequence).toBeGreaterThan(1)
  })
  it('excludes subagent and reasoning rows and cannot authorize from a subagent user item', async () => {
    const session = fixture.actor.members[0].sessionId
    fixture.journals.set(session, [
      fixture.user,
      {
        ...fixture.user,
        itemId: 'subagent',
        sequence: 2,
        agentId: 'worker',
        body: {
          kind: 'message',
          role: 'user',
          blocks: [{ type: 'text', text: 'Private worker context' }]
        }
      }
    ])
    expect(
      (await readBotReferenceContext(fixture.primary, session)).messages.map((row) => row.id)
    ).toEqual(['user-request'])
    await expect(requireBotUserRequest(fixture.primary, session, 'subagent')).rejects.toThrow(
      'user request'
    )
  })
})
