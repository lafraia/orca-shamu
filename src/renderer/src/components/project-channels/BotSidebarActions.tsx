import { useState } from 'react'
import { Check, Folder, MoreHorizontal, Pin, PinOff, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { openProjectChannelEditor } from './project-channel-store'
import { runBotRosterCommand } from './bot-roster-actions'

export function BotSidebarActions({
  channel,
  sections,
  selected,
  onSection,
  children
}: {
  channel: ProjectChannel
  sections: string[]
  selected: boolean
  onSection: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const organize = (patch: { pinned?: boolean; section?: string }): void => {
    setBusy(true)
    void runBotRosterCommand({ action: 'organize', botId: channel.id, ...patch })
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  const items = (context: boolean): React.JSX.Element => {
    const Item = context ? ContextMenuItem : DropdownMenuItem
    const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator
    const Sub = context ? ContextMenuSub : DropdownMenuSub
    const Trigger = context ? ContextMenuSubTrigger : DropdownMenuSubTrigger
    const Content = context ? ContextMenuSubContent : DropdownMenuSubContent
    return (
      <>
        <Item disabled={busy} onSelect={() => organize({ pinned: !channel.pinned })}>
          {channel.pinned ? <PinOff /> : <Pin />}
          {channel.pinned
            ? translate('shamu.bots.unpin', 'Unpin bot')
            : translate('shamu.bots.pin', 'Pin bot')}
        </Item>
        {!channel.pinned ? (
          <Sub>
            <Trigger disabled={busy}>
              <Folder />
              {translate('shamu.bots.moveSection', 'Move to section')}
            </Trigger>
            <Content>
              <Item onSelect={() => organize({ section: '' })}>
                {translate('shamu.bots.noSection', 'Without section')}
                {!channel.section ? <Check /> : null}
              </Item>
              {sections.map((section) => (
                <Item key={section} onSelect={() => organize({ section })}>
                  {section}
                  {channel.section === section ? <Check /> : null}
                </Item>
              ))}
              <Separator />
              <Item onSelect={onSection}>{translate('shamu.bots.newSection', 'New section…')}</Item>
            </Content>
          </Sub>
        ) : null}
        <Separator />
        <Item onSelect={() => openProjectChannelEditor({ channelId: channel.id })}>
          <Settings />
          {translate('projectChannels.edit', 'Bot settings')}
        </Item>
      </>
    )
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group/bot flex w-full min-w-0 items-center rounded-md hover:bg-worktree-sidebar-accent',
            selected && 'bg-worktree-sidebar-accent'
          )}
        >
          {children}
          <div className="group/bot-actions grid shrink-0 place-items-center">
            {channel.pinned ? (
              <Pin
                className="pointer-events-none col-start-1 row-start-1 hidden size-3 text-muted-foreground transition-opacity duration-(--duration-quick) ease-(--ease-in-out) can-hover:block group-hover/bot:opacity-0 [[class~='group/bot']:has(:focus-visible)_&]:opacity-0 [[class~='group/bot-actions']:has([data-state=open])_&]:opacity-0 motion-reduce:transition-none"
                aria-label={translate('shamu.bots.pinned', 'Pinned')}
              />
            ) : null}
            <DropdownMenu>
              <span className="col-start-1 row-start-1 inline-flex shrink-0 transition-opacity duration-(--duration-quick) ease-(--ease-in-out) can-hover:opacity-0 group-hover/bot:opacity-100 [[class~='group/bot']:has(:focus-visible)_&]:opacity-100 has-[[data-state=open]]:opacity-100 motion-reduce:transition-none">
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy}
                    aria-label={translate('shamu.bots.actions', 'Bot actions: {{name}}', {
                      name: channel.name
                    })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </span>
              <DropdownMenuContent>{items(false)}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>{items(true)}</ContextMenuContent>
    </ContextMenu>
  )
}
