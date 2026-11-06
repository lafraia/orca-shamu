import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AgentJournalRenderItem } from '../../shared/agent-session/journal/agent-session-journal-types'
import { botControlFixture } from './bot-control.test-fixture'
import { BotUnreadService } from './bot-unread-service'

describe('durable bot unread message counts', () => {
  let fixture: Awaited<ReturnType<typeof botControlFixture>>
  let items: AgentJournalRenderItem[]
  let service: BotUnreadService
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(2_000_000)
    fixture = await botControlFixture()
    items = [fixture.user]
    service = new BotUnreadService(fixture.channels, fixture.primary, fixture.directory)
    fixture.call.mockImplementation(async (method, params) => {
      expect(method).toBe('agentSession.history')
      const input = z
        .object({
          sessionId: z.string(),
          direction: z.enum(['tail', 'before']),
          limit: z.number(),
          cursor: z.object({ sequence: z.number() }).optional()
        })
        .parse(params)
      const eligible = input.cursor
        ? items.filter((item) => item.sequence < input.cursor!.sequence)
        : items
      const page = eligible.slice(-input.limit)
      const cursor = (sequence: number) => ({ epoch: 'epoch', sequence })
      const head = cursor(items.at(-1)?.sequence ?? 0)
      return {
        ok: true,
        page: {
          sessionId: input.sessionId,
          epoch: 'epoch',
          items: page,
          hasOlder: page.length < eligible.length,
          liveCursor: head,
          window: {
            oldest: page[0] ? cursor(page[0].sequence) : null,
            newest: page.at(-1) ? cursor(page.at(-1)!.sequence) : null,
            nextCursor: head
          }
        }
      }
    })
  })
  afterEach(async () => {
    vi.useRealTimers()
    await rm(fixture.directory, { recursive: true, force: true })
  })
  const message = (
    sequence: number,
    role: 'user' | 'assistant' = 'assistant'
  ): AgentJournalRenderItem => ({
    ...fixture.user,
    sequence,
    itemId: `message-${sequence}`,
    body: { kind: 'message', role, blocks: [{ type: 'text', text: `Response ${sequence}` }] }
  })
  const mark = (sequence: number) => ({
    botId: 'actor',
    environmentId: 'primary',
    sessionId: fixture.actor.members[0].sessionId,
    cursor: { epoch: 'epoch', sequence }
  })

  it('baselines old history, counts new assistant messages once, and skips user or worker rows', async () => {
    expect((await service.read()).counts.actor).toBe(0)
    items.push(message(2), message(3, 'user'), { ...message(4), agentId: 'worker' }, message(5))
    expect((await service.read()).counts.actor).toBe(2)
    expect((await service.read()).counts.actor).toBe(2)
    items = items.filter((row) => row.itemId !== 'message-5')
    items.push({ ...message(6), itemId: 'message-5', revision: 2 })
    expect((await service.read()).counts.actor).toBe(2)
  })
  it('retains unread messages across restart and does not clear a message newer than the observed view', async () => {
    await service.read()
    items.push(message(2), message(3))
    expect((await service.read()).counts.actor).toBe(2)
    service = new BotUnreadService(fixture.channels, fixture.primary, fixture.directory)
    expect((await service.read()).counts.actor).toBe(2)
    await service.markRead(mark(2))
    expect((await service.read()).counts.actor).toBe(1)
    await service.markRead(mark(3))
    service = new BotUnreadService(fixture.channels, fixture.primary, fixture.directory)
    expect((await service.read()).counts.actor).toBe(0)
    if (process.platform !== 'win32') {
      expect((await stat(join(fixture.directory, 'bot-read-state.json'))).mode & 0o777).toBe(0o600)
    }
  })
  it('resumes older pages after a long tool-heavy conversation and caps the visible count at 99+', async () => {
    await service.read()
    items.push(message(2), ...Array.from({ length: 650 }, (_, index) => message(index + 3, 'user')))
    const first = await service.read()
    expect(first.pending).toContain('actor')
    expect((await service.read()).counts.actor).toBe(1)
    await service.markRead(mark(652))
    items.push(...Array.from({ length: 120 }, (_, index) => message(index + 653)))
    expect(await service.read()).toMatchObject({ counts: { actor: 100 }, pending: [] })
  })
  it('rejects another session or a future read cursor and preserves invalid stored receipts', async () => {
    await service.read()
    await expect(service.markRead({ ...mark(1), sessionId: 'other' })).rejects.toThrow(
      'another bot'
    )
    await expect(service.markRead(mark(100))).rejects.toThrow('observed bot messages')
    const file = join(fixture.directory, 'bot-read-state.json')
    await writeFile(file, '{broken')
    await expect(service.read()).rejects.toThrow('has not been changed')
    expect(await readFile(file, 'utf8')).toBe('{broken')
  })
  it('baselines only preexisting bots and counts the first response of a newly created bot', async () => {
    await fixture.channels.update('actor', (row) => ({ ...row, createdAt: 1_940_000 }))
    items = [message(1)]
    expect((await service.read()).counts.actor).toBe(0)
    const member = {
      ...fixture.actor.members[0],
      id: 'new-member',
      tabId: 'new-tab',
      sessionId: 'new-session'
    }
    await fixture.channels.create({
      ...fixture.actor,
      id: 'new-bot',
      createdAt: 2_000_001,
      members: [member],
      mainMemberId: member.id,
      home: { ...fixture.actor.home!, memberId: member.id }
    })
    expect((await service.read(['new-bot'])).counts['new-bot']).toBe(1)
  })
})
