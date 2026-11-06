import { Badge } from '@/components/ui/badge'

export function BotUnreadDot({ count }: { count: number }): React.JSX.Element | null {
  return count > 0 ? (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-[8%] bottom-[8%] inline-flex rounded-full ring-2 ring-worktree-sidebar group-hover/bot:ring-worktree-sidebar-accent group-data-[current=true]/bot-row:ring-worktree-sidebar-accent"
    >
      <Badge variant="unreadDot" />
    </span>
  ) : null
}
