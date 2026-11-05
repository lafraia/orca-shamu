import { useState } from 'react'
import { ChevronDown, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { BotAvatar } from './BotAvatar'
import { BotUnreadBadge } from './BotUnreadBadge'
import { botUnreadDescription, useBotUnread } from './bot-unread-store'
import { BotSidebarActions } from './BotSidebarActions'
import { openProjectChannel } from './project-channel-store'
import { runBotRosterCommand } from './bot-roster-actions'

export function BotSidebarGroups({
  channels,
  sections,
  selectedId,
  active
}: {
  channels: ProjectChannel[]
  sections: string[]
  selectedId: string | null
  active: boolean
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<ProjectChannel | null>(null)
  const [sectionName, setSectionName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const counts = useBotUnread((state) => state.counts)
  const pending = useBotUnread((state) => state.pending)
  const groups = [
    {
      key: 'pinned',
      name: translate('shamu.bots.pinned', 'Pinned'),
      bots: channels.filter((row) => row.pinned),
      pinned: true
    },
    ...[...new Set(channels.filter((row) => !row.pinned).map((row) => row.section ?? ''))].map(
      (section) => ({
        key: `section:${section}`,
        name: section || translate('projectChannels.projects', 'Bots'),
        bots: channels.filter((row) => !row.pinned && (row.section ?? '') === section),
        pinned: false
      })
    )
  ].filter((group) => group.bots.length)
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="mb-3" aria-label={group.name}>
          {groups.length > 1 || group.key !== 'section:' ? (
            <Button
              variant="ghost"
              size="xs"
              className="mb-1 w-full justify-start"
              aria-expanded={!collapsed[group.key]}
              onClick={() => setCollapsed({ ...collapsed, [group.key]: !collapsed[group.key] })}
            >
              <ChevronDown
                className={cn(
                  'size-3 transition-transform motion-reduce:transition-none',
                  collapsed[group.key] && '-rotate-90'
                )}
              />
              {group.pinned ? <Pin className="size-3" /> : null}
              <span className="truncate">{group.name}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-muted-foreground">{group.bots.length}</span>
                <BotUnreadBadge
                  count={group.bots.reduce((sum, bot) => sum + (counts[bot.id] ?? 0), 0)}
                  pending={group.bots.some((bot) => pending.includes(bot.id))}
                />
              </span>
            </Button>
          ) : null}
          {!collapsed[group.key]
            ? group.bots.map((channel) => (
                <BotSidebarActions
                  key={channel.id}
                  channel={channel}
                  sections={sections}
                  onSection={() => {
                    setEditing(channel)
                    setSectionName('')
                    setError(null)
                  }}
                >
                  <button
                    type="button"
                    data-current={active && channel.id === selectedId}
                    aria-current={active && channel.id === selectedId ? 'page' : undefined}
                    aria-description={botUnreadDescription(
                      counts[channel.id] ?? 0,
                      pending.includes(channel.id)
                    )}
                    onClick={() => openProjectChannel(channel.id)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-worktree-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active && channel.id === selectedId && 'bg-worktree-sidebar-accent'
                    )}
                  >
                    <BotAvatar
                      id={channel.id}
                      identity={channel.identity}
                      className={group.pinned ? 'size-9' : 'size-7 rounded-lg'}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate font-medium',
                        group.pinned && 'font-semibold'
                      )}
                    >
                      {channel.name}
                    </span>
                    <BotUnreadBadge
                      count={counts[channel.id] ?? 0}
                      pending={pending.includes(channel.id)}
                    />
                  </button>
                </BotSidebarActions>
              ))
            : null}
        </section>
      ))}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditing(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{translate('shamu.bots.newSection', 'New section…')}</DialogTitle>
            <DialogDescription>
              {translate(
                'shamu.bots.sectionHint',
                'Group bots by project, client or responsibility.'
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            id="bot-section-form"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!editing || busy || !sectionName.trim()) {
                return
              }
              setBusy(true)
              void runBotRosterCommand({
                action: 'organize',
                botId: editing.id,
                section: sectionName.trim()
              })
                .then(() => setEditing(null))
                .catch((failure: unknown) =>
                  setError(failure instanceof Error ? failure.message : 'Could not create section.')
                )
                .finally(() => setBusy(false))
            }}
          >
            <Label htmlFor="bot-section-name">
              {translate('shamu.bots.sectionName', 'Section name')}
            </Label>
            <Input
              id="bot-section-name"
              autoFocus
              maxLength={80}
              value={sectionName}
              onChange={(event) => setSectionName(event.target.value)}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
              {translate('projectChannels.cancel', 'Cancel')}
            </Button>
            <Button type="submit" form="bot-section-form" disabled={busy || !sectionName.trim()}>
              {translate('shamu.bots.createSection', 'Create section')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
