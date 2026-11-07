import { cn } from '@/lib/utils'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { BotLiveAvatar } from './BotLiveAvatar'
import { BotUnreadDot } from './BotUnreadDot'
import { botUnreadDescription, useBotUnread } from './bot-unread-store'
import { BotSidebarActions } from './BotSidebarActions'
import { BotSidebarStatus } from './BotSidebarStatus'
import { BotSidebarDropMark, useBotSidebarDrag, type BotSidebarDragItem } from './BotSidebarDrag'
import { moveBotSidebarItem } from './bot-roster-actions'
import { openProjectChannel } from './project-channel-store'

export function BotSidebarRow({
  channel,
  sections,
  selected,
  onSection
}: {
  channel: ProjectChannel
  sections: string[]
  selected: boolean
  onSection: () => void
}): React.JSX.Element {
  const count = useBotUnread((state) => state.counts[channel.id] ?? 0)
  const pending = useBotUnread((state) => state.pending.includes(channel.id))
  const item: BotSidebarDragItem = {
    kind: 'bot',
    id: `bot:${channel.id}`,
    label: channel.name,
    section: channel.pinned ? null : (channel.section ?? '')
  }
  const drag = useBotSidebarDrag(item)
  const member = channel.home?.ready
    ? channel.members.find((row) => row.id === channel.home?.memberId)
    : null
  return (
    <div ref={drag.ref} className={cn('relative', drag.dragging && 'opacity-40')}>
      <BotSidebarDropMark placement={drag.insertion} />
      <BotSidebarActions
        channel={channel}
        sections={sections}
        selected={selected}
        onSection={onSection}
      >
        <button
          {...drag.handle}
          type="button"
          data-current={selected}
          aria-label={channel.name}
          aria-current={selected ? 'page' : undefined}
          aria-description={botUnreadDescription(count, pending)}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          onKeyDown={(event) => {
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
              event.preventDefault()
              event.stopPropagation()
              if (!drag.pending) {
                void moveBotSidebarItem(item, event.key === 'ArrowUp' ? 'up' : 'down').catch(
                  () => {}
                )
              }
            }
          }}
          onClick={() => openProjectChannel(channel.id)}
          className="group/bot-row flex min-w-0 flex-1 cursor-grab touch-manipulation items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-worktree-sidebar-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative inline-flex shrink-0">
            <BotLiveAvatar
              id={channel.id}
              identity={channel.identity}
              member={member ?? undefined}
              className={channel.pinned ? 'size-12' : 'size-7 rounded-lg'}
            />
            <BotUnreadDot count={count} />
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-medium',
              channel.pinned && 'text-base font-semibold'
            )}
          >
            {channel.name}
          </span>
          {member ? <BotSidebarStatus member={member} /> : null}
        </button>
      </BotSidebarActions>
    </div>
  )
}
