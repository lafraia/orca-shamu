import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { channelFixture, channelMember } from '../shared/project-channels.test-fixture'
import { ProjectChannelsStore } from './project-channels-store'
import { BotMemoryService } from './bot-memory-service'
import type { BotMemoryEntry } from '../shared/bot-memory'
import { readBotTurnPrompt } from '../shared/bot-turn-context'

describe('persistent bot memory', () => {
  let root: string
  let channels: ProjectChannelsStore
  let service: BotMemoryService
  const primary = { read: async () => ({ environmentId: 'primary' }) }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'shamu-memory-'))
    channels = new ProjectChannelsStore(root)
    const member = {
      ...channelMember(),
      target: { kind: 'environment' as const, environmentId: 'primary' }
    }
    const bot = {
      ...channelFixture(),
      members: [member],
      home: {
        directory: join(root, 'bot'),
        memberId: member.id,
        createOperationId: 'operation',
        createFingerprint: 'fingerprint',
        ready: true
      }
    }
    await mkdir(bot.home.directory)
    await writeFile(
      join(root, 'project-channels.json'),
      JSON.stringify({ version: 1, revision: 1, channels: [bot] })
    )
    service = new BotMemoryService(channels, primary)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })
  function entry(): BotMemoryEntry {
    return {
      id: '00000000-0000-4000-8000-000000000001',
      key: 'Release',
      kind: 'task',
      scope: 'Shamu',
      text: 'Next action: verify the signed bundle',
      sources: [
        { sessionId: 'session-coordinator', messageId: 'message-7', label: 'Release instructions' }
      ],
      pinned: false,
      archived: false,
      updatedAt: 7
    }
  }
  it('recovers grounded task memory after a service restart in the same native conversation', async () => {
    const first = await service.read('project')
    await service.write('project', { version: 1, entries: [entry()] }, first.fingerprint)
    service = new BotMemoryService(new ProjectChannelsStore(root), primary)
    const text = await service.prepare('session-coordinator', 'primary', 'Continue the release')
    expect(text).toContain('verify the signed bundle')
    expect(text).toContain('message-7')
    expect(readBotTurnPrompt(text)?.message).toBe('Continue the release')
    expect(readBotTurnPrompt(text)?.context.selection).toMatchObject({
      strategy: 'terms-v1',
      unmatched: 0,
      overBudget: 0,
      matches: [{ id: entry().id, terms: ['the', 'release'] }]
    })
    expect(readBotTurnPrompt(text)?.context.guidance).toContain('in English where practical')
    expect(readBotTurnPrompt(text)?.context.guidance).toContain('Markdown reference from bots list')
    expect(await service.prepare('session-coordinator', 'primary', text)).toBe(text)
    expect((await channels.read()).channels[0].members[0].sessionId).toBe('session-coordinator')
    expect(await readFile(join(root, 'bot', 'BOT_MEMORY.md'), 'utf8')).toContain(
      'before compaction'
    )
  })
  it('does not leak one bot memory to an external chat or another primary server', async () => {
    const first = await service.read('project')
    await service.write('project', { version: 1, entries: [entry()] }, first.fingerprint)
    expect(await service.prepare('another-session', 'primary', 'Hello')).toBe('Hello')
    expect(await service.prepare('session-coordinator', 'other-server', 'Hello')).toBe('Hello')
    const refused = new BotMemoryService(channels, {
      read: async () => ({ environmentId: 'other-server' })
    })
    await expect(refused.read('project')).rejects.toThrow('different Orca server')
  })
  it('refuses stale UI edits after the agent updates its memory and preserves the agent version', async () => {
    const initial = await service.read('project')
    await writeFile(
      join(root, 'bot', 'memory.json'),
      JSON.stringify({ version: 1, entries: [entry()] })
    )
    await expect(
      service.write('project', { version: 1, entries: [] }, initial.fingerprint)
    ).rejects.toThrow('changed while')
    expect((await service.read('project')).memory.entries).toEqual([entry()])
  })
  it('does not silently replace malformed memory with an empty file or send a turn without it', async () => {
    await service.read('project')
    await writeFile(join(root, 'bot', 'memory.json'), 'broken')
    await expect(service.prepare('session-coordinator', 'primary', 'Continue')).rejects.toThrow(
      'memory is invalid'
    )
    expect(await readFile(join(root, 'bot', 'memory.json'), 'utf8')).toBe('broken')
  })
})
