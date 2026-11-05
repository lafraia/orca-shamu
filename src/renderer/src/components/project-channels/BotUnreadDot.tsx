import { Badge } from '@/components/ui/badge'

export function BotUnreadDot({ count }: { count: number }): React.JSX.Element | null {
  return count > 0 ? <Badge variant="unreadDot" aria-hidden="true" /> : null
}
