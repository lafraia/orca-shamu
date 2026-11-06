import { useStructuredAgentSessionStatusSummary } from '../native-chat/structured-agent-session-status-hooks'
import { agentStateLabel } from '../AgentStateDot'
import { getWorktreeStatusLabel, type WorktreeStatus } from '@/lib/worktree-status'
import { structuredAgentSessionAgentStatus } from '../../../../shared/agent-session/view/structured-agent-session-agent-status'
import { agentVerdictDisplayMark } from '../../../../shared/agent-status/lifecycle/agent-main-agent-verdict'
import type { ProjectChannelMember } from '../../../../shared/project-channels'

export function useBotActivity(member: ProjectChannelMember): {
  status: WorktreeStatus | 'unverifiable' | null
  motion: 'idle' | 'working' | 'waiting'
  label: string | null
} {
  const { summary, observation } = useStructuredAgentSessionStatusSummary(
    member.sessionId,
    member.target
  )
  if (!summary?.status) {
    return { status: null, motion: 'idle', label: null }
  }
  if (observation !== 'live') {
    return { status: 'unverifiable', motion: 'idle', label: agentStateLabel('unverifiable') }
  }
  const projected = structuredAgentSessionAgentStatus({
    ...summary,
    status: summary.status,
    childWork: summary.children ?? summary.backgroundTasks
  })
  const status: WorktreeStatus =
    agentVerdictDisplayMark(projected) ??
    (projected.state === 'working'
      ? (projected.workingMode ?? 'working')
      : projected.state === 'blocked' || projected.state === 'waiting'
        ? 'permission'
        : summary.turnOutcome
          ? 'done'
          : 'active')
  return {
    status,
    motion:
      status === 'working' || status === 'monitoring'
        ? 'working'
        : status === 'permission'
          ? 'waiting'
          : 'idle',
    label: status === 'permission' ? agentStateLabel('waiting') : getWorktreeStatusLabel(status)
  }
}
