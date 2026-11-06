import { useState } from 'react'
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
import { botSectionNames } from '../../../../shared/bot-sections'
import { BotSectionHeader } from './BotSectionHeader'
import { BotSidebarRow } from './BotSidebarRow'
import { BotSidebarDrag, BotSidebarDropMark, useBotSidebarDrag } from './BotSidebarDrag'
import { runBotRosterCommand } from './bot-roster-actions'

export function BotSidebarGroups({
  channels,
  sections,
  sectionOrder,
  selectedId,
  active
}: {
  channels: ProjectChannel[]
  sections: string[]
  sectionOrder: string[]
  selectedId: string | null
  active: boolean
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<ProjectChannel | null>(null)
  const [sectionName, setSectionName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const groups = [
    {
      key: 'pinned',
      name: translate('shamu.bots.pinned', 'Pinned'),
      bots: channels.filter((row) => row.pinned),
      pinned: true
    },
    ...botSectionNames(
      channels.filter((row) => !row.pinned),
      sectionOrder
    ).map((section) => ({
      key: `section:${section}`,
      name: section || translate('shamu.bots.general', 'General'),
      bots: channels.filter((row) => !row.pinned && (row.section ?? '') === section),
      pinned: false
    }))
  ].filter((group) => group.bots.length)
  return (
    <>
      <BotSidebarDrag>
        {groups.map((group) => (
          <BotSidebarGroup
            key={group.key}
            name={group.name}
            section={group.pinned ? null : group.key.slice('section:'.length)}
            collapsed={Boolean(collapsed[group.key])}
            onToggle={() =>
              setCollapsed((current) => ({ ...current, [group.key]: !current[group.key] }))
            }
            canMoveUp={sectionOrder.indexOf(group.key.slice('section:'.length)) > 0}
            canMoveDown={
              sectionOrder.indexOf(group.key.slice('section:'.length)) < sectionOrder.length - 1
            }
            onRenamed={(name) =>
              setCollapsed((current) => ({
                ...current,
                [`section:${name}`]: Boolean(current[group.key])
              }))
            }
          >
            {!collapsed[group.key]
              ? group.bots.map((channel) => (
                  <BotSidebarRow
                    key={channel.id}
                    channel={channel}
                    sections={sections}
                    selected={active && channel.id === selectedId}
                    onSection={() => {
                      setEditing(channel)
                      setSectionName('')
                      setError(null)
                    }}
                  />
                ))
              : null}
          </BotSidebarGroup>
        ))}
      </BotSidebarDrag>
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

function BotSidebarGroup({
  children,
  ...props
}: Omit<React.ComponentProps<typeof BotSectionHeader>, 'dragHandle'> & {
  children: React.ReactNode
}): React.JSX.Element {
  const drag = useBotSidebarDrag({
    kind: 'section',
    id: props.section === null ? 'pinned' : `section:${props.section}`,
    label: props.name,
    section: props.section
  })
  return (
    <section
      ref={drag.ref}
      className={cn('relative mb-3', drag.dragging && 'opacity-40')}
      aria-label={props.name}
    >
      <BotSidebarDropMark placement={drag.insertion} />
      <BotSectionHeader {...props} dragHandle={props.section === null ? undefined : drag.handle} />
      <div className="pl-4">{children}</div>
    </section>
  )
}
