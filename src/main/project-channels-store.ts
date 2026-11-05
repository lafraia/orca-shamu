import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  emptyProjectChannels,
  projectChannelsSnapshotSchema,
  type ProjectChannel,
  type ProjectChannelsSnapshot
} from '../shared/project-channels'
import { withSidecarSnapshotQueue, writeSidecarSnapshot } from './filesystem/sidecar-snapshot-file'
import { botSectionNames, botSectionNameSchema } from '../shared/bot-sections'

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
        if (JSON.stringify(channel.creation) !== JSON.stringify(previous?.creation)) {
          throw new Error('Bot creation provenance is managed by Shamu.')
        }
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

  async create(channel: ProjectChannel): Promise<ProjectChannelsSnapshot> {
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      const existing = current.channels.find((row) => row.id === channel.id)
      if (existing) {
        if (existing.creation?.fingerprint !== channel.creation?.fingerprint) {
          throw new Error('This creation request was already used for another bot.')
        }
        return current
      }
      const next = projectChannelsSnapshotSchema.parse({
        ...current,
        revision: current.revision + 1,
        channels: [...current.channels, channel]
      })
      await writeSidecarSnapshot(this.file, next, 0o600)
      return next
    })
  }

  renameSection(name: string, newName: string): Promise<ProjectChannelsSnapshot> {
    const previous = botSectionNameSchema.parse(name)
    const nextName = botSectionNameSchema.min(1).parse(newName)
    return this.changeSections((current) => {
      const order = botSectionNames(current.channels, current.sectionOrder)
      if (!order.includes(previous)) {
        throw new Error('This group no longer exists. Reload bots before trying again.')
      }
      if (previous === nextName) {
        return current
      }
      if (order.includes(nextName)) {
        throw new Error('A group with this name already exists.')
      }
      return {
        ...current,
        sectionOrder: order.map((section) => (section === previous ? nextName : section)),
        channels: current.channels.map((bot) =>
          (bot.section ?? '') === previous ? { ...bot, section: nextName } : bot
        )
      }
    })
  }

  moveSection(name: string, direction: 'up' | 'down'): Promise<ProjectChannelsSnapshot> {
    const section = botSectionNameSchema.parse(name)
    return this.changeSections((current) => {
      const order = botSectionNames(current.channels, current.sectionOrder)
      const visible = botSectionNames(
        current.channels.filter((bot) => !bot.pinned),
        order
      )
      const position = visible.indexOf(section)
      if (position === -1) {
        throw new Error('This group no longer exists. Reload bots before trying again.')
      }
      const neighbor = visible[position + (direction === 'up' ? -1 : 1)]
      if (neighbor === undefined) {
        return current
      }
      const from = order.indexOf(section)
      const to = order.indexOf(neighbor)
      order[from] = neighbor
      order[to] = section
      return { ...current, sectionOrder: order }
    })
  }

  private changeSections(
    update: (snapshot: ProjectChannelsSnapshot) => ProjectChannelsSnapshot
  ): Promise<ProjectChannelsSnapshot> {
    return withSidecarSnapshotQueue(this.file, async () => {
      const current = await this.read()
      const updated = update(current)
      if (updated === current) {
        return current
      }
      const next = projectChannelsSnapshotSchema.parse({
        ...updated,
        revision: current.revision + 1
      })
      await writeSidecarSnapshot(this.file, next, 0o600)
      return next
    })
  }
}
