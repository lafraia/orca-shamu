import StatusIndicator from '../sidebar/workspace-card/surface/StatusIndicator'
import { AgentStateDot } from '../AgentStateDot'
import { StateIndicatorTooltip } from '../StateIndicatorTooltip'
import type { ProjectChannelMember } from '../../../../shared/project-channels'
import { useBotActivity } from './use-bot-activity'

export function BotSidebarStatus({
  member
}: {
  member: ProjectChannelMember
}): React.JSX.Element | null {
  const { status, label } = useBotActivity(member)
  if (status === null) {
    return null
  }
  if (status === 'unverifiable') {
    return <AgentStateDot state="unverifiable" size="md" tooltipSide="right" />
  }
  return (
    <StateIndicatorTooltip label={label} side="right">
      <StatusIndicator
        status={status}
        role="img"
        aria-label={label ?? undefined}
        showTooltip={false}
      />
    </StateIndicatorTooltip>
  )
}
