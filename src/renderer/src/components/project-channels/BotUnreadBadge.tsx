import { Badge } from '@/components/ui/badge'

export function BotUnreadBadge({
  count,
  pending = false
}: {
  count: number
  pending?: boolean
}): React.JSX.Element | null {
  if (count <= 0) {
    return null
  }
  const label = count > 99 ? '99+' : `${count}${pending ? '+' : ''}`
  return (
    <Badge key={label} variant="notification" aria-hidden="true">
      {label}
    </Badge>
  )
}
