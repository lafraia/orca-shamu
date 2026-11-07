import { z } from 'zod'
import {
  getRepoExecutionHostId,
  toRuntimeExecutionHostId,
  toSshExecutionHostId
} from '../../shared/execution-host'
import { resolveFolderWorkspaceRowHost } from '../../shared/folder-workspaces/folder-workspace-execution-host'
import type { BotProjectCatalogEntry } from '../../shared/bot-projects'
import type { ProjectChannelsSnapshot } from '../../shared/project-channels'

const host = {
  connectionId: z.string().nullable().optional(),
  executionHostId: z.string().nullable().optional()
}
export const botProjectReposReply = z.object({
  repos: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      displayName: z.string(),
      projectGroupId: z.string().nullable().optional(),
      ...host
    })
  )
})
export const botProjectGroupsReply = z.object({
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      parentPath: z.string().nullable(),
      parentGroupId: z.string().nullable(),
      ...host
    })
  )
})
export const botProjectFoldersReply = z.object({
  folderWorkspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      folderPath: z.string(),
      projectGroupId: z.string(),
      isArchived: z.boolean().optional(),
      ...host
    })
  )
})

export function botProjectCatalogEntries(input: {
  environmentId: string
  repos: z.infer<typeof botProjectReposReply>['repos']
  groups: z.infer<typeof botProjectGroupsReply>['groups']
  folderWorkspaces: z.infer<typeof botProjectFoldersReply>['folderWorkspaces']
  snapshot: ProjectChannelsSnapshot
}): BotProjectCatalogEntry[] {
  const owned = new Set(
    input.snapshot.channels.flatMap((bot) =>
      bot.members
        .filter(
          (member) =>
            member.id === bot.home?.memberId &&
            member.target.kind === 'environment' &&
            member.target.environmentId === input.environmentId
        )
        .map((member) => member.worktreeId)
    )
  )
  const entries: BotProjectCatalogEntry[] = input.repos.map((repo) => ({
    ref: {
      environmentId: input.environmentId,
      executionHostId: getRepoExecutionHostId(repo),
      kind: 'repo',
      id: repo.id
    },
    name: repo.displayName,
    path: repo.path,
    projectGroupId: repo.projectGroupId ?? null
  }))
  const botGroups = new Set<string>()
  for (const folder of input.folderWorkspaces) {
    if (owned.has(`folder:${folder.id}`)) {
      botGroups.add(folder.projectGroupId)
      continue
    }
    if (folder.isArchived) {
      continue
    }
    const resolved = resolveFolderWorkspaceRowHost(
      {
        repos: input.repos,
        projectGroups: input.groups,
        folderWorkspaces: input.folderWorkspaces
      },
      folder
    )
    const executionHostId =
      resolved.kind === 'local'
        ? 'local'
        : resolved.kind === 'ssh'
          ? toSshExecutionHostId(resolved.targetId)
          : resolved.kind === 'runtime'
            ? toRuntimeExecutionHostId(resolved.environmentId)
            : null
    if (!executionHostId) {
      continue
    }
    entries.push({
      ref: { environmentId: input.environmentId, executionHostId, kind: 'folder', id: folder.id },
      name: folder.name,
      path: folder.folderPath,
      projectGroupId: folder.projectGroupId
    })
  }
  for (const group of input.groups) {
    if (botGroups.has(group.id) && !entries.some((entry) => entry.projectGroupId === group.id)) {
      continue
    }
    entries.push({
      ref: {
        environmentId: input.environmentId,
        executionHostId: getRepoExecutionHostId(group),
        kind: 'group',
        id: group.id
      },
      name: group.name,
      path: group.parentPath,
      projectGroupId: null,
      parentGroupId: group.parentGroupId
    })
  }
  return entries
}
