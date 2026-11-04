import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelFixture } from '../shared/project-channels.test-fixture'
import type { BotMentionRequest } from '../shared/bot-mentions'
import { BotMentionDelivery } from './bot-mention-delivery'

describe('bot mention delivery', () => {
  let directory: string
  let request: BotMentionRequest
  const channel = channelFixture()
  const member = channel.members[0]
  channel.home = {
    directory: '/bot',
    memberId: member.id,
    ready: true,
    createOperationId: 'create',
    createFingerprint: 'fingerprint'
  }
  member.target = { kind: 'environment', environmentId: 'primary' }
  const snapshot = { version: 1 as const, revision: 0, channels: [channel] }
  const channels = { read: vi.fn(async () => snapshot) }
  const bots = { ensure: vi.fn(async () => snapshot) }
  const call = vi.fn<(method: string, params: unknown) => Promise<unknown>>()
  const primary = { read: async () => ({ environmentId: 'primary' }), call }
  const service = () => new BotMentionDelivery(channels, bots, primary, directory)

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-bot-mention-'))
    request = {
      id: randomUUID(),
      botIds: [channel.id, channel.id],
      text: '@Coordinator please review this',
      source: {
        environmentId: 'primary',
        sessionId: 'source-session',
        worktreeId: 'folder:source',
        label: 'Planning'
      }
    }
    call.mockReset().mockImplementation(async (method, input) => {
      if (method === 'agentSession.history') {
        return { ok: true, page: { fence: 7 } }
      }
      if (method === 'agentSession.send') {
        const params = z
          .object({
            envelope: z.object({ clientOperationId: z.string().regex(/^\d{13}-[0-9a-f]{32}$/) })
          })
          .parse(input)
        const saved = JSON.parse(
          await readFile(join(directory, 'bot-mentions', `${request.id}.json`), 'utf8')
        )
        expect(saved.receipts[0].state).toBe('issued')
        expect(saved.receipts[0].operationId).toBe(params.envelope.clientOperationId)
        return {
          ok: true,
          value: { clientMessageId: params.envelope.clientOperationId, queued: {} }
        }
      }
      throw new Error(`Unexpected method ${method}`)
    })
    bots.ensure.mockClear()
  })
  afterEach(async () => rm(directory, { recursive: true, force: true }))

  it('delivers once to the permanent bot chat, with origin and native queue policy', async () => {
    const deliveries = await Promise.all([service().deliver(request), service().deliver(request)])
    expect(deliveries[0]).toEqual([{ botId: channel.id, name: channel.name, state: 'recorded' }])
    expect(deliveries[1]).toEqual(deliveries[0])
    const sends = call.mock.calls.filter(([method]) => method === 'agentSession.send')
    expect(sends).toHaveLength(1)
    expect(sends[0][1]).toMatchObject({
      delivery: 'queue-if-active',
      envelope: { sessionId: member.sessionId, expectedRuntimeFence: 7 },
      body: {
        role: 'user',
        blocks: [{ type: 'text', text: expect.stringContaining('source-session') }]
      }
    })
    expect(JSON.stringify(sends[0][1])).toContain('Planning')
    if (process.platform !== 'win32') {
      expect((await stat(join(directory, 'bot-mentions', `${request.id}.json`))).mode & 0o777).toBe(
        0o600
      )
    }
    await expect(service().deliver({ ...request, text: 'different message' })).rejects.toThrow(
      'already used'
    )
  })

  it('retains an ambiguous result across restart without resending', async () => {
    const normal = call.getMockImplementation()!
    call.mockImplementation(async (method, input) => {
      if (method === 'agentSession.send') {
        throw new Error('Reply lost after recording')
      }
      return normal(method, input)
    })
    expect((await service().deliver(request))[0].state).toBe('unconfirmed')
    expect((await service().deliver(request))[0].state).toBe('unconfirmed')
    expect(call.mock.calls.filter(([method]) => method === 'agentSession.send')).toHaveLength(1)
  })

  it('rejects another server and deleted bots without issuing a send', async () => {
    await expect(
      service().deliver({ ...request, source: { ...request.source, environmentId: 'other' } })
    ).rejects.toThrow('different Orca server')
    expect(call).not.toHaveBeenCalled()
    await expect(service().deliver({ ...request, botIds: ['deleted'] })).rejects.toThrow(
      'no longer'
    )
    expect(bots.ensure).not.toHaveBeenCalled()
    expect(call.mock.calls.some(([method]) => method === 'agentSession.send')).toBe(false)
  })

  it('does not call a bot from its own conversation', async () => {
    const receipts = await service().deliver({
      ...request,
      source: { ...request.source, sessionId: member.sessionId }
    })
    expect(receipts[0].state).toBe('self')
    expect(call.mock.calls.some(([method]) => method === 'agentSession.send')).toBe(false)
  })
})
