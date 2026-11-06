import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VaultEntry, VaultEntryInput } from '../../../../../shared/shamu-vault'

export function VaultEntryEditor({
  entry,
  busy,
  onSave,
  onCancel
}: {
  entry: VaultEntry | null
  busy: boolean
  onSave: (input: VaultEntryInput) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const id = useId()
  const [allowAgent, setAllowAgent] = useState(entry?.allowAgent ?? false)
  return (
    <form
      className="space-y-4"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        if (!form.reportValidity()) {
          return
        }
        const data = new FormData(form)
        const password = form.elements.namedItem('secret') as HTMLInputElement
        const secret = password.value
        password.value = ''
        void onSave({
          ...(entry ? { id: entry.id } : {}),
          name: String(data.get('name') ?? ''),
          username: String(data.get('username') ?? ''),
          website: String(data.get('website') ?? ''),
          environmentVariable: String(data.get('environmentVariable') ?? ''),
          allowAgent,
          ...(secret ? { secret } : {})
        })
      }}
    >
      <h3 className="text-sm font-medium">{entry ? 'Edit credential' : 'New credential'}</h3>
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          name="name"
          defaultValue={entry?.name}
          required
          maxLength={120}
          disabled={busy}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-username`}>Username</Label>
        <Input
          id={`${id}-username`}
          name="username"
          defaultValue={entry?.username}
          maxLength={320}
          disabled={busy}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-website`}>Website</Label>
        <Input
          id={`${id}-website`}
          name="website"
          type="url"
          defaultValue={entry?.website}
          maxLength={2048}
          disabled={busy}
          placeholder="https://example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-secret`}>
          {entry ? 'Replace password or token' : 'Password or token'}
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-secret`}
            name="secret"
            type="password"
            required={!entry}
            maxLength={16384}
            disabled={busy}
            autoComplete="new-password"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={(event) => {
              const field = event.currentTarget.form?.elements.namedItem(
                'secret'
              ) as HTMLInputElement | null
              if (field) {
                const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
                field.value = Array.from(
                  crypto.getRandomValues(new Uint8Array(32)),
                  (byte) => alphabet[byte & 63]
                ).join('')
              }
            }}
          >
            Generate
          </Button>
        </div>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-agent`}
            checked={allowAgent}
            onCheckedChange={(value) => setAllowAgent(value === true)}
            disabled={busy}
          />
          <Label htmlFor={`${id}-agent`}>Allow this bot to request use</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Each command needs your approval. The agent receives a reference and an exit code.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-variable`}>Environment variable</Label>
        <Input
          id={`${id}-variable`}
          name="environmentVariable"
          defaultValue={entry?.environmentVariable ?? 'ORCA_VAULT_SECRET'}
          required
          pattern="[A-Z][A-Z0-9_]{1,63}"
          maxLength={64}
          disabled={busy}
          spellCheck={false}
          className="font-mono"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save credential'}
        </Button>
      </div>
    </form>
  )
}
