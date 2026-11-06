import { useId, useState, type ComponentPropsWithRef } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, MoreHorizontal, Pencil, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
import { moveBotSidebarItem, runBotRosterCommand } from './bot-roster-actions'

export function BotSectionHeader({
  name,
  section,
  dragHandle,
  collapsed,
  onToggle,
  canMoveUp,
  canMoveDown,
  onRenamed
}: {
  name: string
  section: string | null
  dragHandle?: ComponentPropsWithRef<'button'>
  collapsed: boolean
  onToggle: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onRenamed: (newName: string) => void
}): React.JSX.Element {
  const inputId = useId()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const move = (direction: 'up' | 'down'): void => {
    if (section === null || busy) {
      return
    }
    setBusy(true)
    setError(null)
    void runBotRosterCommand(
      { action: 'section.move', name: section, direction },
      { reportError: false }
    )
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'Could not move this group.')
      )
      .finally(() => setBusy(false))
  }
  return (
    <>
      <div className="group/bot-section mb-1 flex items-center gap-1">
        <Button
          {...dragHandle}
          variant="ghost"
          size="xs"
          className={cn(
            'min-w-0 flex-1 touch-manipulation justify-start',
            section !== null && 'cursor-grab active:cursor-grabbing'
          )}
          aria-expanded={!collapsed}
          aria-label={translate('shamu.bots.toggleGroup', 'Toggle group: {{name}}', { name })}
          onClick={onToggle}
          aria-keyshortcuts={section === null ? undefined : 'Alt+ArrowUp Alt+ArrowDown'}
          onKeyDown={(event) => {
            if (
              section !== null &&
              event.altKey &&
              (event.key === 'ArrowUp' || event.key === 'ArrowDown')
            ) {
              event.preventDefault()
              event.stopPropagation()
              if (!busy && !dragHandle?.['aria-disabled']) {
                void moveBotSidebarItem(
                  { kind: 'section', id: `section:${section}`, label: name, section },
                  event.key === 'ArrowUp' ? 'up' : 'down'
                ).catch(() => {})
              }
            }
          }}
        >
          <ChevronDown
            className={cn(
              'size-3 transition-transform duration-(--duration-fast) ease-(--ease-smooth-out) motion-reduce:transition-none',
              collapsed && '-rotate-90'
            )}
          />
          {section === null ? <Pin className="size-3" /> : null}
          <span className="truncate">{name}</span>
        </Button>
        {section !== null ? (
          <DropdownMenu>
            <span className="inline-flex shrink-0 transition-opacity duration-(--duration-quick) ease-(--ease-in-out) can-hover:opacity-0 group-hover/bot-section:opacity-100 group-focus-within/bot-section:opacity-100 has-[[data-state=open]]:opacity-100 motion-reduce:transition-none">
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy}
                  aria-label={translate('shamu.bots.groupActions', 'Group actions: {{name}}', {
                    name
                  })}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </span>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setNewName(name)
                  setError(null)
                  setRenaming(true)
                }}
              >
                <Pencil />
                {translate('shamu.bots.renameGroup', 'Rename group…')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canMoveUp} onSelect={() => move('up')}>
                <ArrowUp />
                {translate('shamu.bots.moveGroupUp', 'Move up')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveDown} onSelect={() => move('down')}>
                <ArrowDown />
                {translate('shamu.bots.moveGroupDown', 'Move down')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {error && !renaming ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Dialog
        open={renaming}
        onOpenChange={(open) => {
          if (!busy) {
            setRenaming(open)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{translate('shamu.bots.renameGroupTitle', 'Rename group')}</DialogTitle>
            <DialogDescription>
              {translate(
                'shamu.bots.sectionHint',
                'Group bots by project, client or responsibility.'
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            id={inputId}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (section === null || busy || !newName.trim()) {
                return
              }
              setBusy(true)
              setError(null)
              void runBotRosterCommand(
                {
                  action: 'section.rename',
                  name: section,
                  newName: newName.trim()
                },
                { reportError: false }
              )
                .then(() => {
                  onRenamed(newName.trim())
                  setRenaming(false)
                })
                .catch((failure: unknown) =>
                  setError(
                    failure instanceof Error ? failure.message : 'Could not rename this group.'
                  )
                )
                .finally(() => setBusy(false))
            }}
          >
            <Label htmlFor={`${inputId}-name`}>
              {translate('shamu.bots.groupName', 'Group name')}
            </Label>
            <Input
              id={`${inputId}-name`}
              autoFocus
              maxLength={80}
              disabled={busy}
              value={newName}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setNewName(event.target.value)}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setRenaming(false)}>
              {translate('projectChannels.cancel', 'Cancel')}
            </Button>
            <Button type="submit" form={inputId} disabled={busy || !newName.trim()}>
              {translate('shamu.bots.saveGroup', 'Save group')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
