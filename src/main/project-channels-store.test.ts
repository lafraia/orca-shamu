import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectChannelsStore } from './project-channels-store'
import { channelFixture } from '../shared/project-channels.test-fixture'

describe('project conversation persistence', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'project-channels-test-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('preserves participants, original session identity, history and drafts after restart', async () => {
    const store = new ProjectChannelsStore(directory)
    const initial = await store.read()
    const channel = channelFixture()
    channel.draft = 'An unfinished message'
    channel.messages.push({ id: 'message', role: 'user', text: 'Hello', createdAt: 10 })
    const saved = await store.write({ ...initial, channels: [channel] })
    expect(saved.revision).toBe(1)
    expect(await new ProjectChannelsStore(directory).read()).toEqual(saved)
    if (process.platform !== 'win32') {
      expect((await stat(join(directory, 'project-channels.json'))).mode & 0o777).toBe(0o600)
    }
  })

  it('persists bots without conversations alongside existing shared chats', async () => {
    const store = new ProjectChannelsStore(directory)
    const existing = channelFixture()
    const bot = {
      ...channelFixture(),
      id: 'bot',
      name: 'Coordinator',
      instructions: 'Track the project.',
      mainMemberId: null,
      members: []
    }
    const initial = await store.read()
    const saved = await store.write({ ...initial, channels: [existing, bot] })
    expect(await new ProjectChannelsStore(directory).read()).toEqual(saved)
    expect(saved.channels[0]).toEqual(existing)
    const linked = await store.write({
      ...saved,
      channels: [
        existing,
        {
          ...bot,
          members: [{ ...existing.members[0], sessionId: 'new-session' }],
          mainMemberId: existing.members[0].id
        }
      ]
    })
    expect(linked.channels[1].instructions).toBe(bot.instructions)
    const unlinked = await store.write({ ...linked, channels: [existing, bot] })
    expect(await new ProjectChannelsStore(directory).read()).toEqual(unlinked)
  })

  it('refuses a stale concurrent save rather than losing another window changes', async () => {
    const store = new ProjectChannelsStore(directory)
    const initial = await store.read()
    const result = await Promise.allSettled([
      store.write({ ...initial, channels: [channelFixture()] }),
      store.write({ ...initial, channels: [] })
    ])
    expect(result.map((row) => row.status)).toEqual(['fulfilled', 'rejected'])
    expect((await store.read()).channels).toHaveLength(1)
  })

  it('does not overwrite a malformed or newer file with an empty project list', async () => {
    const file = join(directory, 'project-channels.json')
    await writeFile(file, '{broken')
    const store = new ProjectChannelsStore(directory)
    await expect(store.read()).rejects.toThrow()
    await expect(store.write({ version: 1, revision: 0, channels: [] })).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('{broken')
  })
})
