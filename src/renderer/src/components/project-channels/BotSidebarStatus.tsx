import { useStructuredAgentSessionStatusSummary } from '../native-chat/structured-agent-session-status-hooks'
import StatusIndicator from '../sidebar/workspace-card/surface/StatusIndicator'
import { AgentStateDot, agentStateLabel } from '../AgentStateDot'
import { StateIndicatorTooltip } from '../StateIndicatorTooltip'
import { getWorktreeStatusLabel, type WorktreeStatus } from '@/lib/worktree-status'
import { structuredAgentSessionAgentStatus } from '../../../../shared/agent-session/view/structured-agent-session-agent-status'
import { agentVerdictDisplayMark } from '../../../../shared/agent-status/lifecycle/agent-main-agent-verdict'
import type { ProjectChannelMember } from '../../../../shared/project-channels'

export function BotSidebarStatus({
  member
}: {
  member: ProjectChannelMember
}): React.JSX.Element | null {
  const { summary, observation } = useStructuredAgentSessionStatusSummary(
    member.sessionId,
    member.target
  )
  if (!summary?.status) {
    return null
  }
  if (observation !== 'live') {
    return <AgentStateDot state="unverifiable" size="md" tooltipSide="right" />
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
  const label =
    status === 'permission' ? agentStateLabel('waiting') : getWorktreeStatusLabel(status)
  return (
    <StateIndicatorTooltip label={label} side="right">
      <StatusIndicator status={status} role="img" aria-label={label} showTooltip={false} />
    </StateIndicatorTooltip>
  )
}
