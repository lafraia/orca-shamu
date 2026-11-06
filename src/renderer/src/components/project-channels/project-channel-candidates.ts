import type { AppState } from '@/store/types'
import { useAppStore } from '@/store'
import type { ProjectChannelMember } from '../../../../shared/project-channels'
import { isStructuredTab } from '../../../../shared/agent-session/view/structured-agent-session-tab'
import {
  structuredAgentSessionTargetForTab,
  executionHostIdForStructuredTarget
} from '@/runtime/structured-agent-session-owner'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { shamuAllowsSessionTarget } from '../shamu/shamu-client-state'

export function projectChannelCandidates(
  state: AppState,
  byWorktree = state.unifiedTabsByWorktree
): ProjectChannelMember[] {
  return Object.values(byWorktree).flatMap((tabs) =>
    tabs.flatMap((tab) => {
      if (!isStructuredTab(tab) || !tab.agentSessionAgent) {
        return []
      }
      const target = structuredAgentSessionTargetForTab(state, tab)
      if (!target || !shamuAllowsSessionTarget(target)) {
        return []
      }
      return [
        {
          id: tab.id,
          tabId: tab.id,
          worktreeId: tab.worktreeId,
          sessionId: tab.entityId,
          target,
          agent: tab.agentSessionAgent,
          name: tab.customLabel || tab.label || tab.agentSessionAgent,
          handle: tab.agentSessionAgent.replace(/[^a-z0-9_-]/g, '').slice(0, 28) || 'agent',
          baseline: [],
          historyImported: false,
          importHistory: false
        }
      ]
    })
  )
}

export function availableProjectChannelMember(
  state: AppState,
  member: ProjectChannelMember
): boolean {
  if (!shamuAllowsSessionTarget(member.target)) {
    return false
  }
  const tab = state.unifiedTabsByWorktree[member.worktreeId]?.find((row) => row.id === member.tabId)
  if (
    !tab ||
    !isStructuredTab(tab) ||
    tab.entityId !== member.sessionId ||
    tab.agentSessionAgent !== member.agent
  ) {
    return false
  }
  const target = structuredAgentSessionTargetForTab(state, tab)
  return (
    target?.kind === member.target.kind &&
    (target.kind === 'local' ||
      (member.target.kind === 'environment' &&
        target.environmentId === member.target.environmentId))
  )
}

export function uniqueProjectChannelHandle(base: string, taken: readonly string[]): string {
  let value = base
  let suffix = 2
  while (taken.includes(value) || value === 'all') {
    value = `${base}-${suffix++}`
  }
  return value
}

export function openProjectChannelSource(member: ProjectChannelMember): void {
  // The original tab remains the sole owner of the session and its directory.
  const state = useAppStore.getState()
  if (!availableProjectChannelMember(state, member)) {
    return
  }
  if (
    activateAndRevealWorkspace(member.worktreeId, {
      executionHostId: executionHostIdForStructuredTarget(member.target)
    }) === false
  ) {
    return
  }
  state.activateTab(member.tabId, { worktreeId: member.worktreeId })
  useAppStore.setState({ activeView: 'terminal' })
}
