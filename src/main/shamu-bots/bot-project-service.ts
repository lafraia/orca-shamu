import {
  botProjectKey,
  type BotProjectCatalog,
  type BotProjectLink,
  type BotProjectsContext
} from '../../shared/bot-projects'
import type { ProjectChannelsSnapshot } from '../../shared/project-channels'
import { getProjectGroupSubtreeIds } from '../../shared/project-groups'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { ProjectChannelsStore } from '../project-channels-store'
import type { ShamuPrimaryConnection } from '../shamu-primary-connection'
import {
  botProjectCatalogEntries,
  botProjectFoldersReply,
  botProjectGroupsReply,
  botProjectReposReply
} from './bot-project-catalog'

export class BotProjectService {
  constructor(
    private readonly channels: Pick<ProjectChannelsStore, 'read'>,
    private readonly primary: Pick<ShamuPrimaryConnection, 'read' | 'call'>
  ) {}

  async catalog(): Promise<BotProjectCatalog> {
    const { environmentId } = await this.primary.read()
    if (!environmentId) {
      throw new Error('Connect Shamu to the primary Orca to link projects.')
    }
    const [repoReply, groupReply, folderReply, snapshot] = await Promise.all([
      this.primary.call('repo.list', {}),
      this.primary.call('projectGroup.list', {}),
      this.primary.call('folderWorkspace.list', {}),
      this.channels.read()
    ])
    return {
      entries: botProjectCatalogEntries({
        environmentId,
        snapshot,
        repos: botProjectReposReply.parse(repoReply).repos,
        groups: botProjectGroupsReply.parse(groupReply).groups,
        folderWorkspaces: botProjectFoldersReply.parse(folderReply).folderWorkspaces
      })
    }
  }

  async assertLinks(snapshot: ProjectChannelsSnapshot): Promise<void> {
    const current = await this.channels.read()
    const additions = snapshot.channels.flatMap((bot) => {
      const previous = new Set(
        current.channels.find((row) => row.id === bot.id)?.projects?.map(botProjectKey)
      )
      return (bot.projects ?? []).filter((link) => !previous.has(botProjectKey(link)))
    })
    if (additions.length === 0) {
      return
    }
    const keys = new Set((await this.catalog()).entries.map((entry) => botProjectKey(entry.ref)))
    if (additions.some((link) => !keys.has(botProjectKey(link)))) {
      throw new Error(
        'A linked project changed or belongs to another Orca server. Refresh projects before saving.'
      )
    }
  }

  async context(links: readonly BotProjectLink[]): Promise<BotProjectsContext | undefined> {
    if (links.length === 0) {
      return undefined
    }
    const { entries } = await this.catalog()
    const { environmentId } = await this.primary.read()
    if (!environmentId) {
      throw new Error('The primary Orca disconnected. Retry before sending.')
    }
    const byKey = new Map(entries.map((entry) => [botProjectKey(entry.ref), entry]))
    const selected = new Map<string, (typeof entries)[number]>()
    const unavailable: BotProjectsContext['unavailable'] = []
    const groups = entries
      .filter((entry) => entry.ref.kind === 'group')
      .map((entry) => ({
        id: entry.ref.id,
        parentGroupId: entry.parentGroupId ?? null
      }))
    const containers: typeof entries = []
    for (const link of links) {
      const key = botProjectKey(link)
      const entry = byKey.get(key)
      if (!entry) {
        unavailable.push({
          name: link.name,
          reason: link.environmentId === environmentId ? 'missing' : 'other-server'
        })
        continue
      }
      selected.set(key, entry)
      if (entry.ref.kind === 'group' || entry.ref.kind === 'folder') {
        containers.push(entry)
      }
    }
    for (const group of containers) {
      const subtree =
        group.ref.kind === 'group'
          ? getProjectGroupSubtreeIds(groups, group.ref.id)
          : new Set<string>()
      for (const candidate of entries) {
        if (candidate.ref.executionHostId !== group.ref.executionHostId) {
          continue
        }
        const member =
          candidate.ref.kind === 'group'
            ? subtree.has(candidate.ref.id)
            : candidate.projectGroupId !== null && subtree.has(candidate.projectGroupId)
        const descendant =
          group.path &&
          candidate.path &&
          group.ref.executionHostId === candidate.ref.executionHostId &&
          isPathInsideOrEqual(group.path, candidate.path)
        if (member || descendant) {
          selected.set(botProjectKey(candidate.ref), candidate)
        }
      }
    }
    const context: BotProjectsContext = { environmentId, entries: [], unavailable, omitted: 0 }
    let size = 0
    for (const entry of selected.values()) {
      const row = {
        id: entry.ref.id,
        name: entry.name,
        kind: entry.ref.kind,
        path: entry.path,
        executionHostId: entry.ref.executionHostId
      }
      const length = JSON.stringify(row).length
      if (context.entries.length >= 100 || size + length > 12_000) {
        context.omitted++
      } else {
        context.entries.push(row)
        size += length
      }
    }
    return context
  }
}
