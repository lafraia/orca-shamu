import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { shamuMirrorsFloatingWorkspace } from '@/components/shamu/shamu-client-state'

export function isHostMirroredWorktree(worktreeId: string, environmentId?: string): boolean {
  return (
    worktreeId !== FLOATING_TERMINAL_WORKTREE_ID || shamuMirrorsFloatingWorkspace(environmentId)
  )
}
