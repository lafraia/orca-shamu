import { BotAvatar } from './BotAvatar'
import { useBotActivity } from './use-bot-activity'
import type { ProjectChannelMember } from '../../../../shared/project-channels'

export function BotLiveAvatar({
  member,
  ...props
}: React.ComponentProps<typeof BotAvatar> & { member?: ProjectChannelMember }): React.JSX.Element {
  return member ? <SessionAvatar member={member} {...props} /> : <BotAvatar {...props} />
}

function SessionAvatar({
  member,
  ...props
}: React.ComponentProps<typeof BotAvatar> & { member: ProjectChannelMember }): React.JSX.Element {
  const activity = useBotActivity(member)
  return <BotAvatar {...props} activity={activity.motion} />
}
