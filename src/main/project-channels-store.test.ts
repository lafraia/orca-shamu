import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectChannelsStore } from './project-channels-store'
import { channelFixture } from '../shared/project-channels.test-fixture'
import { botSectionNames } from '../shared/bot-sections'

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

  it('renames every group member atomically, including a pinned bot remembered group', async () => {
    const store = new ProjectChannelsStore(directory)
    const native = { ...channelFixture(), section: 'Research', draft: 'Keep this draft' }
    const peer = {
      ...channelFixture(),
      id: 'peer',
      members: [],
      mainMemberId: null,
      section: 'Research'
    }
    const pinned = { ...peer, id: 'pinned', pinned: true }
    const saved = await store.write({ ...(await store.read()), channels: [native, peer, pinned] })
    const next = await store.renameSection('Research', 'Development')
    expect(next.channels).toEqual(saved.channels.map((bot) => ({ ...bot, section: 'Development' })))
    expect(next.sectionOrder).toEqual(['Development'])
    expect(next.revision).toBe(saved.revision + 1)
    expect(await new ProjectChannelsStore(directory).read()).toEqual(next)
    await expect(store.write({ ...saved, channels: [] })).rejects.toThrow('another window')
    expect(await store.read()).toEqual(next)
  })

  it('rejects colliding, empty and stale names without changing any bots', async () => {
    const store = new ProjectChannelsStore(directory)
    const other = {
      ...channelFixture(),
      id: 'other',
      members: [],
      mainMemberId: null,
      section: 'Operations'
    }
    const saved = await store.write({
      ...(await store.read()),
      channels: [channelFixture(), other]
    })
    await expect(store.renameSection('', 'Operations')).rejects.toThrow('already exists')
    expect(() => store.renameSection('', '   ')).toThrow()
    await expect(store.renameSection('Gone', 'New')).rejects.toThrow('no longer exists')
    expect(await store.read()).toEqual(saved)
    const renamed = await store.renameSection('', 'Development')
    expect(renamed.channels[0].section).toBe('Development')
    expect(renamed.channels[1]).toEqual(other)
  })

  it('persists group order without reordering bots, skips hidden groups and appends new groups', async () => {
    const store = new ProjectChannelsStore(directory)
    const bots = ['Alpha', 'Hidden', 'Beta', 'Gamma'].map((section) => ({
      ...channelFixture(),
      id: section,
      section,
      members: [],
      mainMemberId: null,
      pinned: section === 'Hidden'
    }))
    const saved = await store.write({
      ...(await store.read()),
      channels: bots,
      sectionOrder: ['Alpha', 'Hidden', 'Beta', 'Gamma']
    })
    const moved = await store.moveSection('Gamma', 'up')
    expect(moved.sectionOrder).toEqual(['Alpha', 'Hidden', 'Gamma', 'Beta'])
    expect(moved.channels).toEqual(saved.channels)
    const first = await store.moveSection('Gamma', 'up')
    expect(first.sectionOrder).toEqual(['Gamma', 'Hidden', 'Alpha', 'Beta'])
    expect(await store.moveSection('Gamma', 'up')).toEqual(first)
    const reopened = await new ProjectChannelsStore(directory).read()
    expect(reopened).toEqual(first)
    const added = await store.create({ ...bots[0], id: 'new', section: 'Delta' })
    expect(
      botSectionNames(
        added.channels.filter((bot) => !bot.pinned),
        added.sectionOrder
      )
    ).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta'])
  })

  it('serializes group edits with bot changes without losing conversation state', async () => {
    const store = new ProjectChannelsStore(directory)
    await store.write({
      ...(await store.read()),
      channels: [{ ...channelFixture(), section: 'Research' }]
    })
    await Promise.all([
      store.renameSection('Research', 'Development'),
      store.update('project', (bot) => ({ ...bot, draft: 'A concurrently saved draft' }))
    ])
    expect((await store.read()).channels[0]).toMatchObject({
      section: 'Development',
      draft: 'A concurrently saved draft',
      members: channelFixture().members
    })
  })
})
