import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { channelFixture } from '../shared/project-channels.test-fixture'
import { structuredAgentSessionCreateParams } from '../shared/agent-session/structured-agent-session-create'
import { ProjectChannelsStore } from './project-channels-store'
import { BotConversationService } from './bot-conversation-service'

describe('permanent bot conversations', () => {
  let directory: string
  let channels: ProjectChannelsStore
  let service: BotConversationService
  let loseCreateReply: boolean
  let groups: { id: string; name: string; parentPath: string }[]
  let folders: { id: string; folderPath: string }[]
  const call = vi.fn<(method: string, params: unknown) => Promise<unknown>>()
  const bot = () => ({
    ...channelFixture(),
    id: 'ceo',
    name: 'CEO',
    mainMemberId: null,
    members: []
  })
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-bot-chat-'))
    channels = new ProjectChannelsStore(directory)
    loseCreateReply = false
    groups = []
    folders = []
    call.mockReset().mockImplementation(async (method, params) => {
      switch (method) {
        case 'settings.get':
          return {
            settings: { workspaceDir: join(directory, 'workspaces'), defaultTuiAgent: 'codex' }
          }
        case 'projectGroup.list':
          return { groups }
        case 'projectGroup.create': {
          const row = z.object({ name: z.string(), parentPath: z.string() }).parse(params)
          const group = { id: 'bots', ...row }
          groups.push(group)
          return { group }
        }
        case 'folderWorkspace.list':
          return { folderWorkspaces: folders }
        case 'folderWorkspace.create': {
          const row = z.object({ folderPath: z.string() }).parse(params)
          const folderWorkspace = { id: `folder-${folders.length}`, ...row }
          folders.push(folderWorkspace)
          return { folderWorkspace }
        }
        case 'agentSession.create': {
          const row = z
            .object({ envelope: z.object({ sessionId: z.string() }), tabId: z.string() })
            .parse(params)
          if (loseCreateReply) {
            loseCreateReply = false
            throw new Error('Connection lost after create')
          }
          return { ok: true, value: { sessionId: row.envelope.sessionId, tabId: row.tabId } }
        }
        case 'agentSession.history':
          return { ok: true }
        default:
          throw new Error(`Unexpected method: ${method}`)
      }
    })
    service = new BotConversationService(
      channels,
      {
        read: async () => ({ environmentId: 'primary' }),
        call
      },
      directory,
      directory
    )
    await channels.write({ ...(await channels.read()), channels: [bot()] })
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('gives an existing empty bot a dedicated workspace and reopens its single native session', async () => {
    const first = await service.ensure('ceo')
    const channel = first.channels[0]
    expect(channel.home).toMatchObject({ ready: true, memberId: channel.mainMemberId })
    expect(channel.members).toHaveLength(1)
    expect(channel.members[0]).toMatchObject({
      agent: 'codex',
      target: { kind: 'environment', environmentId: 'primary' },
      worktreeId: 'folder:folder-0'
    })
    const home = channel.home!
    expect(home.directory.startsWith(join(directory, 'orca', 'bots'))).toBe(true)
    expect(JSON.parse(await readFile(join(home.directory, 'bot.json'), 'utf8'))).toMatchObject({
      id: 'ceo',
      name: 'CEO'
    })
    expect(await readFile(join(home.directory, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
    if (process.platform !== 'win32') {
      expect((await stat(join(home.directory, 'bot.json'))).mode & 0o777).toBe(0o600)
    }
    expect(await service.ensure('ceo')).toEqual(first)
    expect(call.mock.calls.filter(([method]) => method === 'agentSession.create')).toHaveLength(1)
    expect(call.mock.calls.some(([method]) => method === 'agentSession.send')).toBe(false)
    expect(folders).toHaveLength(1)
    expect(groups).toHaveLength(1)
  })

  it('promotes one existing worktree chat without creating a second session or moving its workspace', async () => {
    const source = channelFixture().members[0]
    source.sessionId = 'codex_00000000_0000_4000_8000_000000000001'
    source.target = { kind: 'environment', environmentId: 'primary' }
    await channels.write({
      ...(await channels.read()),
      channels: [{ ...bot(), members: [source], mainMemberId: source.id }]
    })
    const adopted = (await service.ensure('ceo')).channels[0]
    expect(adopted.members).toEqual([source])
    expect(adopted.home).toMatchObject({ ready: true, memberId: source.id })
    expect(call.mock.calls.filter(([method]) => method === 'agentSession.create')).toHaveLength(0)
    expect(folders).toHaveLength(0)
    expect((await service.ensure('ceo')).channels[0]).toEqual(adopted)
  })

  it('persists the canonical create envelope before a lost reply and replays it after restart', async () => {
    loseCreateReply = true
    await expect(service.ensure('ceo')).rejects.toThrow('Connection lost')
    const pending = (await channels.read()).channels[0]
    expect(pending.home?.ready).toBe(false)
    const member = pending.members[0]
    const params = call.mock.calls.find(([method]) => method === 'agentSession.create')![1]
    const canonical = structuredAgentSessionCreateParams({
      sessionId: member.sessionId,
      agent: member.agent,
      worktree: `id:${member.worktreeId}`,
      tabId: member.tabId,
      randomUuid: () => '00000000-0000-4000-8000-000000000000'
    })
    expect(pending.home?.createFingerprint).toBe(canonical.envelope.payloadFingerprint)
    const restarted = new BotConversationService(
      new ProjectChannelsStore(directory),
      {
        read: async () => ({ environmentId: 'primary' }),
        call
      },
      directory,
      directory
    )
    const saved = await restarted.ensure('ceo')
    expect(saved.channels[0].members).toEqual(pending.members)
    expect(saved.channels[0].home?.ready).toBe(true)
    expect(
      call.mock.calls
        .filter(([method]) => method === 'agentSession.create')
        .map(([, params]) => params)
    ).toEqual([params, params])
    expect(folders).toHaveLength(1)
  })

  it('serializes repeated openings and keeps custom instruction files while applying bot settings', async () => {
    const [first, second] = await Promise.all([service.ensure('ceo'), service.ensure('ceo')])
    expect(second).toEqual(first)
    const home = first.channels[0].home!
    await writeFile(join(home.directory, 'AGENTS.md'), 'My workspace rules')
    const updated = await channels.write({
      ...first,
      channels: [{ ...first.channels[0], name: 'Coordinator', instructions: 'Track milestones.' }]
    })
    expect(await service.ensure('ceo')).toEqual(updated)
    expect(await readFile(join(home.directory, 'AGENTS.md'), 'utf8')).toBe('My workspace rules')
    expect(JSON.parse(await readFile(join(home.directory, 'bot.json'), 'utf8'))).toMatchObject({
      name: 'Coordinator',
      instructions: 'Track milestones.'
    })
    expect(call.mock.calls.filter(([method]) => method === 'agentSession.create')).toHaveLength(1)
  })

  it('refuses changes that replace the saved bot session or storage path', async () => {
    const snapshot = await service.ensure('ceo')
    const channel = snapshot.channels[0]
    await expect(
      channels.write({
        ...snapshot,
        channels: [{ ...channel, home: { ...channel.home!, directory: join(directory, 'other') } }]
      })
    ).rejects.toThrow('managed by Orca')
    await expect(
      channels.write({
        ...snapshot,
        channels: [
          { ...channel, members: channel.members.map((row) => ({ ...row, sessionId: 'another' })) }
        ]
      })
    ).rejects.toThrow('permanent bot conversation')
    expect(await channels.read()).toEqual(snapshot)
  })

  it('preserves promoted conversations and does not replace them with a new bot session', async () => {
    const initial = await channels.read()
    const promoted = channelFixture()
    await channels.write({ ...initial, channels: [promoted] })
    expect((await service.ensure(promoted.id)).channels).toEqual([promoted])
    expect(call).not.toHaveBeenCalled()
    const snapshot = await channels.read()
    const unlinked = {
      ...promoted,
      mainMemberId: null,
      members: [],
      messages: [{ id: 'old', role: 'user' as const, text: 'Keep this history', createdAt: 1 }]
    }
    await channels.write({ ...snapshot, channels: [unlinked] })
    expect((await service.ensure(unlinked.id)).channels).toEqual([unlinked])
    expect(call).not.toHaveBeenCalled()
  })
})
