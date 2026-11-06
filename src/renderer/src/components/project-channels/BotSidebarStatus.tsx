import { Square, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  if (status === null || status === 'active' || status === 'inactive' || status === 'done') {
    return null
  }
  if (status === 'unverifiable') {
    return <AgentStateDot state="unverifiable" size="md" tooltipSide="right" />
  }
  if (status === 'failed' || status === 'interrupted') {
    const Icon = status === 'failed' ? TriangleAlert : Square
    return (
      <StateIndicatorTooltip label={label} side="right">
        <span role="img" aria-label={label ?? undefined} className="inline-flex shrink-0">
          <Icon
            aria-hidden="true"
            className={cn(
              'size-3',
              status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            )}
          />
        </span>
      </StateIndicatorTooltip>
    )
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
