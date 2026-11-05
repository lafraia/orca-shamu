import type { AppState } from '@/store/types'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import {
  getFolderWorkspaceExecutionHostIdForRows,
  getProjectGroupExecutionHostIdForRows
} from '../../../../shared/sidebar-list/host-filtering'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { getWorkspaceAttachments } from '../../../../shared/workspace-attachments'
import { parseWorkspaceReferenceUrl } from '../../../../shared/workspace-reference-identity'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'

export const EMPTY_MENTION_RESOURCES: readonly NativeChatResourceReference[] = []
const NO_BOT_DIRECTORIES: ReadonlySet<string> = new Set()
const INPUT_KEYS = [
  'repos',
  'projectGroups',
  'folderWorkspaces',
  'worktreesByRepo',
  'workItemsCache'
] as const
type ResourceState = Pick<AppState, (typeof INPUT_KEYS)[number]>
export function nativeChatMentionResources(
  state: ResourceState,
  query: string,
  hostId: ExecutionHostId,
  botDirectories: ReadonlySet<string> = NO_BOT_DIRECTORIES
): NativeChatResourceReference[] {
  const resources: NativeChatResourceReference[] = []
  const groups = new Map(state.projectGroups.map((group) => [group.id, group]))
  const repos = state.repos.filter((repo) => getRepoExecutionHostId(repo) === hostId)
  for (const repo of repos) {
    resources.push({
      kind: 'project',
      id: repo.id,
      projectKind: 'repo',
      hostId,
      label: repo.displayName,
      path: repo.path,
      description: repo.path
    })
  }
  for (const group of state.projectGroups) {
    if (getProjectGroupExecutionHostIdForRows(group, 'local') === hostId) {
      resources.push({
        kind: 'project',
        id: group.id,
        projectKind: 'group',
        hostId,
        label: group.name,
        ...(group.parentPath ? { path: group.parentPath } : {}),
        description: group.parentPath ?? group.name
      })
    }
  }
  const folders = selectFolderWorkspaces(state).filter(
    (folder) =>
      !folder.isArchived &&
      !botDirectories.has(folder.folderPath) &&
      getFolderWorkspaceExecutionHostIdForRows({
        folderWorkspace: folder,
        projectGroup: groups.get(folder.projectGroupId),
        defaultHostId: 'local'
      }) === hostId
  )
  const worktrees = Object.values(selectWorktreesByRepo(state))
    .flat()
    .filter(
      (row) =>
        !row.isArchived &&
        !botDirectories.has(row.path) &&
        (row.hostId === hostId ||
          (row.runtimeOwnerEnvironmentId &&
            hostId === `runtime:${encodeURIComponent(row.runtimeOwnerEnvironmentId)}`))
    )
  for (const row of worktrees) {
    resources.push({
      kind: 'workspace',
      id: row.id,
      hostId,
      label: row.displayName,
      path: row.path,
      description: `${repos.find((repo) => repo.id === row.repoId)?.displayName ?? row.repoId} · ${row.branch ?? row.path}`
    })
  }
  for (const folder of folders) {
    resources.push({
      kind: 'workspace',
      id: folderWorkspaceKey(folder.id),
      hostId,
      label: folder.name,
      path: folder.folderPath,
      description: `${groups.get(folder.projectGroupId)?.name ?? 'Folder'} · ${folder.folderPath}`
    })
  }
  const addIssue = (url: string, title: string, description: string): void => {
    try {
      const issue = parseWorkspaceReferenceUrl(url)
      if (issue.type === 'issue') {
        resources.push({
          kind: 'issue',
          id: issue.url!,
          url: issue.url,
          hostId,
          label: `${issue.identifier ?? `#${issue.number}`} ${title}`,
          description
        })
      }
    } catch {
      // A legacy item without a proven URL cannot be a clickable issue reference.
    }
  }
  for (const row of [...worktrees, ...folders]) {
    for (const issue of getWorkspaceAttachments(row)) {
      if (issue.url && issue.type === 'issue') {
        addIssue(issue.url, issue.title ?? '', `${issue.provider} · ${issue.url}`)
      }
    }
  }
  for (const entry of Object.values(state.workItemsCache)) {
    for (const issue of entry.data ?? []) {
      if (issue.type === 'issue' && issue.repoHostId === hostId) {
        addIssue(issue.url, issue.title, issue.url)
      }
    }
  }
  const needle = query.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
  const matches = resources.filter((row) =>
    `${row.label} ${row.description}`
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase()
      .includes(needle)
  )
  const unique = new Map(
    matches.map((row) => [`${row.kind}:${row.projectKind ?? ''}:${row.id}`, row])
  )
  return (['workspace', 'project', 'issue'] as const).flatMap((kind) =>
    [...unique.values()].filter((row) => row.kind === kind).slice(0, 10)
  )
}
export function createNativeChatMentionResourceSelector(
  query: string | null,
  hostId: ExecutionHostId | null,
  botDirectories: ReadonlySet<string> = NO_BOT_DIRECTORIES
) {
  let inputs: unknown[] | null = null
  let resources = EMPTY_MENTION_RESOURCES
  return (state: ResourceState): readonly NativeChatResourceReference[] => {
    if (query === null || !hostId) {
      return EMPTY_MENTION_RESOURCES
    }
    if (!inputs || INPUT_KEYS.some((key, index) => state[key] !== inputs?.[index])) {
      inputs = INPUT_KEYS.map((key) => state[key])
      resources = nativeChatMentionResources(state, query, hostId, botDirectories)
    }
    return resources
  }
}
