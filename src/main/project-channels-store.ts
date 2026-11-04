import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyProjectChannels,
  projectChannelsSnapshotSchema,
  type ProjectChannel,
  type ProjectChannelsSnapshot
} from '../shared/project-channels'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './filesystem/sidecar-snapshot-file'

export class ProjectChannelsStore {
  private readonly file: string

  constructor(directory: string) {
    this.file = join(directory, 'project-channels.json')
  }

  async read(): Promise<ProjectChannelsSnapshot> {
    let contents: string
    try {
      contents = await readFile(this.file, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return emptyProjectChannels()
      }
      throw error
    }
    return projectChannelsSnapshotSchema.parse(JSON.parse(contents))
  }

  async write(input: unknown): Promise<ProjectChannelsSnapshot> {
    const snapshot = projectChannelsSnapshotSchema.parse(input)
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      if (snapshot.revision !== current.revision) {
        throw new Error('Bots changed in another window. Reload bots before saving.')
      }
      for (const channel of snapshot.channels) {
        const previous = current.channels.find((row) => row.id === channel.id)
        if (JSON.stringify(channel.home) !== JSON.stringify(previous?.home)) {
          throw new Error('The bot conversation is managed by Orca.')
        }
        if (previous?.home) {
          const owner = (row: ProjectChannel): unknown => {
            const member = row.members.find((member) => member.id === previous.home?.memberId)
            return (
              member && {
                tabId: member.tabId,
                worktreeId: member.worktreeId,
                sessionId: member.sessionId,
                agent: member.agent,
                target: member.target
              }
            )
          }
          if (JSON.stringify(owner(channel)) !== JSON.stringify(owner(previous))) {
            throw new Error('Keep the permanent bot conversation linked.')
          }
        }
      }
      const next = { ...snapshot, revision: current.revision + 1 }
      await writeSidecarSnapshot(this.file, next, 0o600)
      return next
    })
  }

  async update(
    id: string,
    update: (channel: ProjectChannel) => ProjectChannel
  ): Promise<ProjectChannelsSnapshot> {
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      if (!current.channels.some((channel) => channel.id === id)) {
        throw new Error('This bot no longer exists.')
      }
      const next = projectChannelsSnapshotSchema.parse({
        ...current,
        revision: current.revision + 1,
        channels: current.channels.map((channel) => (channel.id === id ? update(channel) : channel))
      })
      await writeSidecarSnapshot(this.file, next, 0o600)
      return next
    })
  }
}
