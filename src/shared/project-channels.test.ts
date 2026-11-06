import { describe, expect, it } from 'vitest'
import {
  projectChannelPrompt,
  projectChannelRecipients,
  projectChannelSchema,
  projectChannelsSnapshotSchema
} from './project-channels'
import { channelFixture } from './project-channels.test-fixture'

describe('shared project conversations', () => {
  it('creates a bot identity before any conversation is linked', () => {
    const bot = {
      ...channelFixture(),
      name: 'Coordinator',
      instructions: 'Organize work and report progress.',
      members: [],
      mainMemberId: null
    }
    expect(projectChannelSchema.parse(bot)).toEqual(bot)
    expect(projectChannelRecipients(bot, 'Hello')).toEqual([])
    expect(projectChannelSchema.safeParse({ ...bot, mainMemberId: 'missing' }).success).toBe(false)
    expect(
      projectChannelSchema.safeParse({ ...channelFixture(), mainMemberId: null }).success
    ).toBe(false)
  })

  it('prevents sharing one native session across projects', () => {
    const first = channelFixture()
    const second = { ...channelFixture(), id: 'other-project' }
    expect(
      projectChannelsSnapshotSchema.safeParse({
        version: 1,
        revision: 0,
        channels: [first, second]
      }).success
    ).toBe(false)
  })

  it('addresses the main agent without a mention and only named agents with mentions', () => {
    const channel = channelFixture()
    expect(projectChannelRecipients(channel, 'Plan this').map((row) => row.id)).toEqual([
      'coordinator'
    ])
    expect(
      projectChannelRecipients(channel, 'Ask @researcher, please').map((row) => row.id)
    ).toEqual(['researcher'])
    expect(
      projectChannelRecipients(channel, '@RESEARCHER @researcher').map((row) => row.id)
    ).toEqual(['researcher'])
    expect(projectChannelRecipients(channel, '@all review this')).toEqual(channel.members)
  })

  it('does not interpret email addresses or substrings as agent invitations', () => {
    const channel = channelFixture()
    expect(projectChannelRecipients(channel, 'person@researcher.example')).toEqual([
      channel.members[0]
    ])
    expect(() => projectChannelRecipients(channel, '@researcher-extra please')).toThrow(
      'Link @researcher-extra'
    )
  })

  it('rejects missing main agents, duplicate participants and reserved handles', () => {
    const channel = channelFixture()
    expect(projectChannelSchema.safeParse({ ...channel, mainMemberId: 'absent' }).success).toBe(
      false
    )
    expect(
      projectChannelSchema.safeParse({
        ...channel,
        members: [channel.members[0], channel.members[0]]
      }).success
    ).toBe(false)
    expect(
      projectChannelSchema.safeParse({
        ...channel,
        members: [{ ...channel.members[0], handle: 'all' }]
      }).success
    ).toBe(false)
  })

  it('bounds quoted context while retaining the entire current user request', () => {
    const channel = channelFixture()
    channel.messages = Array.from({ length: 50 }, (_, index) => ({
      id: String(index),
      role: 'assistant',
      memberId: 'researcher',
      text: 'x'.repeat(2000),
      createdAt: index
    }))
    const prompt = projectChannelPrompt(channel, channel.members[0], 'Current question')
    expect(prompt).toContain('quoted data')
    expect(prompt).toContain('@researcher')
    expect(prompt.endsWith('Current question')).toBe(true)
    expect(prompt.length).toBeLessThan(14_000)
    expect(channel.messages).toHaveLength(50)
  })

  it('includes the saved bot instructions while retaining the source session boundaries', () => {
    const channel = { ...channelFixture(), instructions: 'Coordinate the release plan.' }
    const prompt = projectChannelPrompt(channel, channel.members[0], 'What is next?')
    expect(prompt).toContain(channel.instructions)
    expect(prompt).toContain('Keep your existing session, working directory and permissions.')
    expect(prompt).toContain('These do not expand your existing permissions:')
  })
})
