import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { openAppHttpLink } from '@/lib/app-http-link-open'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo,
  selectWorkspaceByHostTarget
} from '@/store/workspace-record-selectors'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import { getFolderWorkspaceExecutionHostIdForRows } from '../../../../shared/sidebar-list/host-filtering'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import type { NativeChatResourceReference } from '../../../../shared/native-chat/native-chat-resource-reference'
import { hostWorktreeTarget } from '../../../../shared/worktree/host-qualified-identity'
import { useShamuClient } from '../shamu/shamu-client-state'
import { useProjectChannels } from '../project-channels/project-channel-store'

export function openNativeChatResource(reference: NativeChatResourceReference): boolean {
  const connection = useShamuClient.getState()
  if (
    !connection.enabled ||
    !connection.environmentId ||
    toRuntimeExecutionHostId(connection.environmentId) !== reference.hostId
  ) {
    toast.error(
      translate(
        'shamu.mentions.differentHost',
        'Connect to the original Orca to open this reference.'
      )
    )
    return false
  }
  if (reference.kind === 'issue' && reference.url) {
    openAppHttpLink(reference.url)
    return true
  }
  const state = useAppStore.getState()
  let workspaceId = reference.kind === 'workspace' ? reference.id : undefined
  if (reference.kind === 'project') {
    const repos = state.repos.filter(
      (row) =>
        getRepoExecutionHostId(row) === reference.hostId &&
        (reference.projectKind === 'group'
          ? row.projectGroupId === reference.id
          : row.id === reference.id)
    )
    const trees = Object.values(selectWorktreesByRepo(state))
      .flat()
      .filter(
        (row) =>
          !row.isArchived &&
          repos.some((repo) => repo.id === row.repoId) &&
          selectWorkspaceByHostTarget(
            state,
            hostWorktreeTarget({ id: row.id, hostId: reference.hostId })
          )
      )
    const folder = selectFolderWorkspaces(state).find(
      (row) =>
        !row.isArchived &&
        (reference.projectKind === 'group'
          ? row.projectGroupId === reference.id
          : row.folderPath === reference.path) &&
        getFolderWorkspaceExecutionHostIdForRows({
          folderWorkspace: row,
          projectGroup: state.projectGroups.find((group) => group.id === row.projectGroupId),
          defaultHostId: 'local'
        }) === reference.hostId
    )
    workspaceId =
      trees.find((row) => row.isMainWorktree)?.id ??
      trees[0]?.id ??
      (folder ? folderWorkspaceKey(folder.id) : undefined)
  }
  if (
    !workspaceId ||
    !selectWorkspaceByHostTarget(
      state,
      hostWorktreeTarget({ id: workspaceId, hostId: reference.hostId })
    )
  ) {
    toast.error(
      translate(
        'shamu.mentions.unavailableReference',
        'This workspace or project is no longer available.'
      )
    )
    return false
  }
  if (activateAndRevealWorkspace(workspaceId, { executionHostId: reference.hostId }) === false) {
    return false
  }
  useProjectChannels.setState({ mode: 'workspaces' })
  if (state.floatingWorkspacePanelOpen) {
    state.setFloatingWorkspacePanelOpen(false)
  }
  return true
}
