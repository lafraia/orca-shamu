import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { LOCAL_EXECUTION_HOST_ID, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import {
  useShamuClient,
  shamuMirrorsFloatingWorkspace
} from '@/components/shamu/shamu-client-state'
import type { WorktreeOperationRoute } from './worktree-operation-route'

export function getFloatingWorkspaceOperationRoute(
  worktreeId: string
): WorktreeOperationRoute | null {
  if (worktreeId !== FLOATING_TERMINAL_WORKTREE_ID) {
    return null
  }
  const environmentId = useShamuClient.getState().environmentId
  return environmentId && shamuMirrorsFloatingWorkspace(environmentId)
    ? {
        executionHostId: toRuntimeExecutionHostId(environmentId),
        runtimeEnvironmentId: environmentId
      }
    : { executionHostId: LOCAL_EXECUTION_HOST_ID, runtimeEnvironmentId: null }
}
