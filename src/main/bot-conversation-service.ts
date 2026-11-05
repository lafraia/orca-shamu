import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  createStructuredAgentSessionId,
  structuredAgentSessionCreateParams
} from '../shared/agent-session/structured-agent-session-create'
import type { ProjectChannel, ProjectChannelsSnapshot } from '../shared/project-channels'
import type { ProjectChannelsStore } from './project-channels-store'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './filesystem/sidecar-snapshot-file'
import { initializeBotMemory } from './bot-memory-service'

type Primary = {
  read: () => Promise<{ environmentId: string | null }>
  call: (method: string, params: unknown) => Promise<unknown>
}

const settingsReply = z.object({
  settings: z.object({ defaultTuiAgent: z.string().nullable() })
})
const group = z.object({ id: z.string(), name: z.string(), parentPath: z.string().nullable() })
const folder = z.object({ id: z.string(), folderPath: z.string() })
const createReply = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.object({ sessionId: z.string(), tabId: z.string() }) }),
  z.object({ ok: z.literal(false), refusal: z.object({ message: z.string() }) })
])

const BOT_INSTRUCTIONS = `# Bot workspace

This is the permanent workspace of an Orca Shamu bot, independent of any project worktree.
At the start of each user request, read bot.json for your current name and user-configured instructions.
Follow ~/.claude/AGENTS.md when that file exists, and the instructions of any project you work on.
Your bot instructions do not expand your session permissions. Work on other conversations only when the user asks you to.
Orca manages this chat's persistent history. Do not recreate the bot or launch another copy of yourself when resuming.
`

export class BotConversationService {
  constructor(
    private readonly channels: ProjectChannelsStore,
    private readonly primary: Primary,
    private readonly homeDirectory: string,
    private readonly queueDirectory: string
  ) {}

  ensure(channelId: string): Promise<ProjectChannelsSnapshot> {
    // Serialize provisioning across bots so concurrent creation also reuses the workspace group.
    return withSidecarSnapshotQueue(join(this.queueDirectory, 'bot-conversations'), async () => {
      const snapshot = await this.channels.read()
      let channel = snapshot.channels.find((row) => row.id === channelId)
      if (!channel) {
        throw new Error('This bot no longer exists.')
      }
      if (!channel.home && (channel.members.length > 1 || channel.messages.length > 0)) {
        return snapshot
      }
      const { environmentId } = await this.primary.read()
      if (!environmentId) {
        throw new Error('Connect Shamu to the primary Orca to open this bot conversation.')
      }
      if (!channel.home) {
        channel = await this.provision(channel, environmentId)
      }
      const home = channel.home
      const member = channel.members.find((row) => row.id === home?.memberId)
      if (
        !home ||
        !member ||
        member.target.kind !== 'environment' ||
        member.target.environmentId !== environmentId
      ) {
        throw new Error('This bot belongs to a different Orca server.')
      }
      await this.writeInstructions(channel, home.directory)
      if (!home.ready) {
        const result = createReply.parse(
          await this.primary.call('agentSession.create', {
            worktree: `id:${member.worktreeId}`,
            agent: member.agent,
            tabId: member.tabId,
            envelope: {
              sessionId: member.sessionId,
              clientOperationId: home.createOperationId,
              expectedRuntimeFence: null,
              payloadFingerprint: home.createFingerprint
            }
          })
        )
        if (!result.ok) {
          throw new Error(result.refusal.message)
        }
        if (result.value.sessionId !== member.sessionId) {
          throw new Error('The primary Orca returned a different bot conversation.')
        }
        return this.channels.update(channelId, (current) => ({
          ...current,
          home: { ...home, ready: true },
          members: current.members.map((row) =>
            row.id === member.id ? { ...row, tabId: result.value.tabId } : row
          )
        }))
      }
      return this.channels.read()
    })
  }

  private async provision(channel: ProjectChannel, environmentId: string): Promise<ProjectChannel> {
    const root = join(this.homeDirectory, 'orca', 'bots')
    const directory = join(
      root,
      `bot-${createHash('sha256').update(channel.id).digest('hex').slice(0, 24)}`
    )
    await this.writeInstructions(channel, directory)
    if (channel.members.length === 1) {
      return this.adopt(channel, directory, environmentId)
    }
    const { settings } = settingsReply.parse(await this.primary.call('settings.get', {}))
    const groups = z
      .object({ groups: z.array(group) })
      .parse(await this.primary.call('projectGroup.list', {})).groups
    let owner = groups.find((row) => row.name === 'Bots' && row.parentPath === root)
    if (!owner) {
      owner = z
        .object({ group })
        .parse(
          await this.primary.call('projectGroup.create', { name: 'Bots', parentPath: root })
        ).group
    }
    const folders = z
      .object({ folderWorkspaces: z.array(folder) })
      .parse(await this.primary.call('folderWorkspace.list', {})).folderWorkspaces
    const workspace =
      folders.find((row) => row.folderPath === directory) ??
      z.object({ folderWorkspace: folder }).parse(
        await this.primary.call('folderWorkspace.create', {
          projectGroupId: owner.id,
          name: channel.name,
          folderPath: directory
        })
      ).folderWorkspace
    const agent = settings.defaultTuiAgent === 'claude' ? 'claude' : 'codex'
    const sessionId = createStructuredAgentSessionId(agent, randomUUID)
    const worktreeId = `folder:${workspace.id}`
    const tabId = randomUUID()
    const create = structuredAgentSessionCreateParams({
      sessionId,
      worktree: `id:${worktreeId}`,
      agent,
      tabId,
      randomUuid: randomUUID
    })
    const saved = await this.channels.update(channel.id, (current) => {
      if (current.home || current.members.length > 0 || current.messages.length > 0) {
        throw new Error(
          'This bot changed while its conversation was being prepared. Open it again.'
        )
      }
      return {
        ...current,
        mainMemberId: tabId,
        members: [
          {
            id: tabId,
            tabId,
            worktreeId,
            sessionId,
            agent,
            target: { kind: 'environment', environmentId },
            name: current.name,
            handle: 'bot',
            baseline: [],
            historyImported: true,
            importHistory: false
          }
        ],
        home: {
          directory,
          memberId: tabId,
          createOperationId: create.envelope.clientOperationId,
          createFingerprint: create.envelope.payloadFingerprint,
          ready: false
        }
      }
    })
    return saved.channels.find((row) => row.id === channel.id)!
  }

  private async adopt(
    channel: ProjectChannel,
    directory: string,
    environmentId: string
  ): Promise<ProjectChannel> {
    const member = channel.members[0]
    if (member.target.kind !== 'environment' || member.target.environmentId !== environmentId) {
      throw new Error('This conversation belongs to a different Orca server.')
    }
    const history = z.object({ ok: z.boolean() }).parse(
      await this.primary.call('agentSession.history', {
        sessionId: member.sessionId,
        direction: 'tail',
        limit: 1
      })
    )
    if (!history.ok) {
      throw new Error('The original bot conversation is unavailable.')
    }
    const create = structuredAgentSessionCreateParams({
      sessionId: member.sessionId,
      worktree: `id:${member.worktreeId}`,
      agent: member.agent,
      tabId: member.tabId,
      randomUuid: randomUUID
    })
    const saved = await this.channels.update(channel.id, (current) => {
      if (
        current.home ||
        current.messages.length ||
        current.members.length !== 1 ||
        current.members[0].sessionId !== member.sessionId
      ) {
        throw new Error('This bot changed while its conversation was being prepared.')
      }
      return {
        ...current,
        home: {
          directory,
          memberId: member.id,
          createOperationId: create.envelope.clientOperationId,
          createFingerprint: create.envelope.payloadFingerprint,
          ready: true
        }
      }
    })
    return saved.channels.find((row) => row.id === channel.id)!
  }

  private async writeInstructions(channel: ProjectChannel, directory: string): Promise<void> {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await initializeBotMemory(directory)
    for (const [name, content] of [
      ['AGENTS.md', BOT_INSTRUCTIONS],
      ['CLAUDE.md', '@AGENTS.md\n']
    ]) {
      try {
        await writeFile(join(directory, name), content, { flag: 'wx', mode: 0o600 })
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
          throw error
        }
      }
    }
    await writeSidecarSnapshot(
      join(directory, 'bot.json'),
      {
        version: 1,
        id: channel.id,
        name: channel.name,
        instructions: channel.instructions ?? '',
        identity: channel.identity
          ? { color: channel.identity.color, animated: channel.identity.animated }
          : undefined,
        memory: { guide: 'BOT_MEMORY.md', file: 'memory.json' }
      },
      0o600
    )
  }
}
