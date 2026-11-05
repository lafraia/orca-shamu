import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { vi } from 'vitest'
import { z } from 'zod'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../shared/agent-session/journal/agent-session-journal-types'
import { channelMember } from '../../shared/project-channels.test-fixture'
import { ProjectChannelsStore } from '../project-channels-store'
import { BotMemoryService } from '../bot-memory-service'
import { BotRoutineService } from './bot-routine-service'

export async function botControlFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'shamu-bot-control-'))
  const channels = new ProjectChannelsStore(directory)
  let now = Date.UTC(2026, 10, 5, 12)
  let provisioned = 0
  const journals = new Map<string, AgentJournalRenderItem[]>()
  const submissions = new Map<string, AgentJournalSubmission[]>()
  const call = vi.fn<(method: string, params: unknown) => Promise<unknown>>()
  const primary = { read: async () => ({ environmentId: 'primary' }), call }
  const bots = {
    ensure: vi.fn(async (id: string) => {
      const channel = (await channels.read()).channels.find((row) => row.id === id)
      if (!channel) {
        throw new Error('Bot missing')
      }
      if (!channel.home) {
        provisioned++
        const member = {
          ...channelMember(`member-${id}`),
          handle: 'bot',
          sessionId: `session-${id}`,
          target: { kind: 'environment' as const, environmentId: 'primary' }
        }
        const home = {
          directory: join(directory, id),
          memberId: member.id,
          createOperationId: randomUUID(),
          createFingerprint: 'create',
          ready: true
        }
        await mkdir(home.directory, { recursive: true })
        await channels.update(id, (row) => ({
          ...row,
          mainMemberId: member.id,
          members: [member],
          home
        }))
      }
      return channels.read()
    })
  }
  await channels.create({
    id: 'actor',
    name: 'Coordinator',
    mainMemberId: null,
    members: [],
    messages: [],
    draft: '',
    createdAt: now
  })
  const actor = (await bots.ensure('actor')).channels[0]
  const sessionId = actor.members[0].sessionId
  const user: AgentJournalRenderItem = {
    itemId: 'user-request',
    revision: 1,
    sequence: 1,
    observedAt: now,
    body: {
      kind: 'message',
      role: 'user',
      blocks: [
        { type: 'text', text: 'Create a Researcher bot, pin it and add routines as requested.' }
      ]
    }
  }
  journals.set(sessionId, [user])
  call.mockImplementation(async (method, params) => {
    const session = z.object({ sessionId: z.string() }).safeParse(params)
    if (method === 'agentSession.history' && session.success) {
      const items = journals.get(session.data.sessionId) ?? []
      const cursor = { epoch: 'epoch', sequence: 1 }
      return {
        ok: true,
        page: {
          sessionId: session.data.sessionId,
          epoch: 'epoch',
          fence: 7,
          items,
          submissions: submissions.get(session.data.sessionId) ?? [],
          window: { oldest: cursor, newest: cursor, nextCursor: cursor },
          hasOlder: false
        }
      }
    }
    if (method === 'agentSession.item' && session.success) {
      const id = z.object({ itemId: z.string() }).parse(params).itemId
      return {
        item: journals.get(session.data.sessionId)?.find((row) => row.itemId === id) ?? null
      }
    }
    if (method === 'agentSession.send') {
      const id = z.object({ envelope: z.object({ clientOperationId: z.string() }) }).parse(params)
        .envelope.clientOperationId
      return {
        ok: true,
        value: {
          clientMessageId: id,
          queued: { messageId: `queued-${id}`, position: 1, state: 'waiting' }
        }
      }
    }
    throw new Error(`Unexpected method ${method}`)
  })
  const memory = new BotMemoryService(channels, primary)
  const service = () => new BotRoutineService(channels, bots, memory, primary, directory, () => now)
  return {
    directory,
    channels,
    bots,
    primary,
    call,
    journals,
    submissions,
    actor,
    user,
    memory,
    service,
    advance: (milliseconds: number) => {
      now += milliseconds
    },
    now: () => now,
    provisioned: () => provisioned
  }
}
