import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { channelFixture, channelMember } from '../../shared/project-channels.test-fixture'
import type { BotMentionRecord } from './bot-mention-record'
import { BotCommunicationStore } from './bot-communication-store'

describe('bot communication records', () => {
  let directory: string
  let record: BotMentionRecord
  let store: BotCommunicationStore
  const bot = (id: string, name: string) => {
    const member = {
      ...channelMember(id),
      target: { kind: 'environment' as const, environmentId: 'primary' }
    }
    return {
      ...channelFixture(),
      id,
      name,
      members: [member],
      home: {
        directory: `/bots/${id}`,
        memberId: id,
        ready: true,
        createOperationId: id,
        createFingerprint: id
      }
    }
  }
  const channels = {
    read: async () => ({
      version: 1 as const,
      revision: 0,
      channels: [bot('ceo', 'CEO'), bot('dev', 'Dev: Vagalume')]
    })
  }
  const primary = { read: async () => ({ environmentId: 'primary' }) }
  const file = () => join(directory, 'bot-mentions', `${record.request.id}.json`)
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shamu-communication-store-'))
    await mkdir(join(directory, 'bot-mentions'))
    record = {
      version: 1,
      fingerprint: 'unchanged',
      request: {
        id: randomUUID(),
        botIds: ['dev'],
        text: 'Review the launch plan',
        source: { environmentId: 'primary', sessionId: 'session-ceo', label: 'Old tab title' }
      },
      receipts: [
        {
          botId: 'dev',
          name: 'Old dev name',
          sessionId: 'session-dev',
          operationId: '1793881751287-0123456789abcdef0123456789abcdef',
          state: 'recorded'
        }
      ],
      context: {
        capturedAt: 1000,
        sessionId: 'session-ceo',
        before: null,
        hasOlder: false,
        messages: [
          {
            id: 'source-user',
            role: 'user',
            text: 'Review the launch plan',
            at: 900,
            attachments: [{ type: 'image-ref', path: '/original/image.png' }]
          },
          { id: 'private', role: 'assistant', text: 'Private unrelated context', at: 950 }
        ]
      }
    }
    await writeFile(file(), JSON.stringify(record))
    store = new BotCommunicationStore(directory, channels, primary)
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('projects old receipts in both chats without exposing injected context or rewriting history', async () => {
    const original = await readFile(file(), 'utf8')
    const from = await store.read('session-ceo')
    expect(from.incomplete).toBe(false)
    expect(from.entries).toHaveLength(1)
    expect(from.entries[0]).toMatchObject({
      source: { name: 'CEO', botId: 'ceo', itemId: 'source-user' },
      recipient: { name: 'Dev: Vagalume', botId: 'dev' },
      createdAt: 1000,
      actor: 'unknown'
    })
    expect((await store.read('session-dev')).entries).toEqual(from.entries)
    expect((await store.read('unrelated')).entries).toEqual([])
    expect(JSON.stringify(from)).not.toContain('Private unrelated context')
    expect(JSON.stringify(from)).not.toContain('Review the launch plan')
    expect(await store.texts([record.request.id])).toEqual([
      {
        referenceId: record.request.id,
        text: record.request.text,
        attachments: [{ type: 'image-ref', path: '/original/image.png' }]
      }
    ])
    expect(await readFile(file(), 'utf8')).toBe(original)
  })
  it('refreshes delivery state and preserves the author and user request reference', async () => {
    await store.read('session-ceo')
    record.origin = { actorId: 'ceo', sourceItemId: 'authorized-user-request' }
    record.createdAt = 1500
    record.receipts[0].state = 'unconfirmed'
    await writeFile(file(), JSON.stringify(record))
    expect((await store.read('session-dev')).entries[0]).toMatchObject({
      actor: 'bot',
      createdAt: 1500,
      state: 'unconfirmed',
      source: { itemId: 'authorized-user-request' }
    })
  })
  it('reports damaged records, rejects path traversal and isolates a different primary', async () => {
    await writeFile(join(directory, 'bot-mentions', `${randomUUID()}.json`), '{broken')
    expect((await store.read('session-dev')).incomplete).toBe(true)
    await expect(store.texts(['../../elsewhere'])).rejects.toThrow()
    record.request.source.environmentId = 'other-primary'
    await writeFile(file(), JSON.stringify(record))
    expect((await store.read('session-dev')).entries).toEqual([])
    await expect(store.texts([record.request.id])).rejects.toThrow('different primary')
  })
})
