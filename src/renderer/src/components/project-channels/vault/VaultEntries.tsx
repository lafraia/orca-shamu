import { translate } from '@/i18n/i18n'
import { Copy, KeyRound, Pencil, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { VaultEntry } from '../../../../../shared/shamu-vault'

export function VaultEntries({
  entries,
  query,
  busy,
  onQuery,
  onNew,
  onCopy,
  onEdit,
  onRemove
}: {
  entries: VaultEntry[]
  query: string
  busy: boolean
  onQuery: (value: string) => void
  onNew: () => void
  onCopy: (entry: VaultEntry) => void
  onEdit: (entry: VaultEntry) => void
  onRemove: (entry: VaultEntry) => void
}): React.JSX.Element {
  const matches = entries.filter((entry) =>
    `${entry.name} ${entry.username} ${entry.website}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      {entries.length ? (
        <div className="flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label={translate('shamu.vault.search', 'Search credentials')}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
      ) : null}
      {!matches.length ? (
        <div className="space-y-2 py-8 text-center">
          <KeyRound className="mx-auto size-6 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            {query
              ? translate('shamu.vault.noMatches', 'No matching credentials')
              : translate('shamu.vault.empty', 'No credentials for this bot')}
          </h3>
          {!query ? (
            <Button variant="link" onClick={onNew}>
              {translate('shamu.vault.add', 'Add a credential')}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {matches.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-4">
              <KeyRound className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="break-words text-sm font-medium">{entry.name}</h3>
                {entry.username ? (
                  <p className="break-all text-sm text-muted-foreground">{entry.username}</p>
                ) : null}
                {entry.website ? (
                  <p className="break-all text-xs text-muted-foreground">{entry.website}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {entry.allowAgent
                    ? translate('shamu.vault.agentAllowed', 'Bot may request use')
                    : translate('shamu.vault.ownerOnly', 'Only you')}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('shamu.vault.copyNamed', 'Copy password: {{name}}', {
                    name: entry.name
                  })}
                  disabled={busy}
                  onClick={() => onCopy(entry)}
                >
                  <Copy />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('shamu.vault.editNamed', 'Edit credential: {{name}}', {
                    name: entry.name
                  })}
                  disabled={busy}
                  onClick={() => onEdit(entry)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('shamu.vault.deleteNamed', 'Delete credential: {{name}}', {
                    name: entry.name
                  })}
                  disabled={busy}
                  onClick={() => onRemove(entry)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
