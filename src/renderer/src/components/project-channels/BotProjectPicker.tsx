import { Check, ChevronsUpDown, FolderOpen, Layers, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  botProjectKey,
  type BotProjectCatalog,
  type BotProjectLink
} from '../../../../shared/bot-projects'

export function BotProjectPicker({
  catalog,
  value,
  onChange,
  disabled
}: {
  catalog: BotProjectCatalog
  value: BotProjectLink[]
  onChange: (value: BotProjectLink[]) => void
  disabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const keys = new Set(value.map(botProjectKey))
  const byKey = new Map(catalog.entries.map((entry) => [botProjectKey(entry.ref), entry]))
  const entries = catalog.entries.filter((entry) =>
    `${entry.name} ${entry.path ?? ''} ${entry.ref.executionHostId}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
  )
  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
          >
            {translate('shamu.projects.link', 'Link projects, folders or groups')}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(360px,calc(100vw-1rem))] min-w-(--radix-popover-trigger-width)"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={translate('shamu.projects.search', 'Search projects, folders or hosts…')}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {translate(
                  'shamu.projects.noResults',
                  'No matching projects. Add projects from the sidebar first.'
                )}
              </CommandEmpty>
              {entries.map((entry) => {
                const key = botProjectKey(entry.ref)
                const checked = keys.has(key)
                return (
                  <CommandItem
                    key={key}
                    value={key}
                    disabled={disabled || (!checked && value.length >= 100)}
                    onSelect={() =>
                      onChange(
                        checked
                          ? value.filter((link) => botProjectKey(link) !== key)
                          : [...value, { ...entry.ref, name: entry.name.slice(0, 200) }]
                      )
                    }
                  >
                    <Check
                      className={cn('size-3.5 shrink-0', checked ? 'opacity-100' : 'opacity-0')}
                    />
                    {entry.ref.kind === 'group' ? (
                      <Layers className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{entry.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.ref.executionHostId} ·{' '}
                        {entry.path ?? translate('shamu.projects.group', 'Project group')}
                      </p>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.map((link) => {
        const key = botProjectKey(link)
        const entry = byKey.get(key)
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            {link.kind === 'group' ? (
              <Layers className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate">{entry?.name ?? link.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {entry
                  ? `${entry.ref.executionHostId} · ${entry.path ?? translate('shamu.projects.group', 'Project group')}`
                  : translate('shamu.projects.missing', 'Not in the current project catalog')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              aria-label={translate('shamu.projects.unlink', 'Unlink {{name}}', {
                name: entry?.name ?? link.name
              })}
              onClick={() => onChange(value.filter((row) => botProjectKey(row) !== key))}
            >
              <X />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
