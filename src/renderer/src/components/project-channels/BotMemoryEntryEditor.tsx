import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import type { BotMemoryEntry } from '../../../../shared/bot-memory'

export type BotMemoryEdit = Pick<BotMemoryEntry, 'key' | 'kind' | 'scope' | 'text' | 'pinned'>
export function BotMemoryEntryEditor({
  entry,
  busy,
  onSave,
  onCancel
}: {
  entry: BotMemoryEntry | null
  busy: boolean
  onSave: (edit: BotMemoryEdit) => void
  onCancel: () => void
}): React.JSX.Element {
  const [edit, setEdit] = useState<BotMemoryEdit>(
    entry ?? { key: '', kind: 'fact', scope: 'bot', text: '', pinned: false }
  )
  return (
    <form
      className="space-y-4 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) {
          onSave(edit)
        }
      }}
    >
      <div
        className="flex gap-1"
        role="group"
        aria-label={translate('shamu.memory.kind', 'Memory type')}
      >
        {(['fact', 'task', 'summary'] as const).map((kind) => (
          <Button
            type="button"
            key={kind}
            size="xs"
            variant={kind === edit.kind ? 'secondary' : 'ghost'}
            aria-pressed={kind === edit.kind}
            onClick={() => setEdit({ ...edit, kind })}
          >
            {translate(
              `shamu.memory.${kind}`,
              kind === 'fact' ? 'Fact' : kind === 'task' ? 'Task state' : 'Summary'
            )}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="bot-memory-key">{translate('shamu.memory.topic', 'Topic')}</Label>
        <Input
          id="bot-memory-key"
          value={edit.key}
          maxLength={120}
          required
          onChange={(event) => setEdit({ ...edit, key: event.target.value })}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bot-memory-scope">
          {translate('shamu.memory.scope', 'Project or scope')}
        </Label>
        <Input
          id="bot-memory-scope"
          value={edit.scope}
          maxLength={256}
          required
          onChange={(event) => setEdit({ ...edit, scope: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bot-memory-text">{translate('shamu.memory.note', 'Note')}</Label>
        <Textarea
          id="bot-memory-text"
          value={edit.text}
          maxLength={8000}
          rows={6}
          required
          onChange={(event) => setEdit({ ...edit, text: event.target.value })}
          placeholder={
            edit.kind === 'task'
              ? translate(
                  'shamu.memory.taskHint',
                  'Objective, decisions, pending work, blockers and next action.'
                )
              : undefined
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="bot-memory-pinned"
          checked={edit.pinned}
          onCheckedChange={(pinned) => setEdit({ ...edit, pinned })}
        />
        <Label htmlFor="bot-memory-pinned">
          {translate('shamu.memory.alwaysRecall', 'Always recall')}
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {translate('projectChannels.cancel', 'Cancel')}
        </Button>
        <Button disabled={busy || !edit.key.trim() || !edit.scope.trim() || !edit.text.trim()}>
          {translate('shamu.memory.save', 'Save memory')}
        </Button>
      </div>
    </form>
  )
}
