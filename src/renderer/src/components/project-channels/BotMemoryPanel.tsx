import { BotReferenceText } from './BotReferenceText'
import { useNativeChatBotCatalogue } from '../native-chat/use-native-chat-bot-catalogue'
import { useEffect, useState } from 'react'
import { Archive, Brain, Pencil, Pin, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { BotMemory, BotMemoryEntry, BotMemorySnapshot } from '../../../../shared/bot-memory'
import type { ProjectChannel } from '../../../../shared/project-channels'
import {
  appendToNativeChatComposerDraft,
  structuredAgentSessionDraftScopeKey
} from '../native-chat/native-chat-composer-draft-store'
import { BotMemoryEntryEditor, type BotMemoryEdit } from './BotMemoryEntryEditor'

export function BotMemoryPanel({
  channel,
  open,
  onOpenChange
}: {
  channel: ProjectChannel
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const catalogue = useNativeChatBotCatalogue(open)
  const [snapshot, setSnapshot] = useState<BotMemorySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<BotMemoryEntry | 'new' | null>(null)
  const [archived, setArchived] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const member = channel.members.find((row) => row.id === channel.home?.memberId)
  useEffect(() => {
    if (!open) {
      return
    }
    let current = true
    setSnapshot(null)
    setError(null)
    void window.api
      .projectChannels!.readMemory(channel.id)
      .then((next) => {
        if (current) {
          setSnapshot(next)
        }
      })
      .catch((failure: unknown) => {
        if (current) {
          setError(failure instanceof Error ? failure.message : 'Could not load bot memory.')
        }
      })
    return () => {
      current = false
    }
  }, [open, channel.id, attempt])
  const persist = async (memory: BotMemory): Promise<void> => {
    if (!snapshot || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      setSnapshot(
        await window.api.projectChannels!.writeMemory(channel.id, memory, snapshot.fingerprint)
      )
      setEditing(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save memory.')
    } finally {
      setBusy(false)
    }
  }
  const save = (edit: BotMemoryEdit): void => {
    if (!snapshot || !member) {
      return
    }
    const previous =
      snapshot.memory.entries.find(
        (entry) => !entry.archived && entry.id === (editing === 'new' ? null : editing?.id)
      ) ??
      snapshot.memory.entries.find(
        (entry) =>
          !entry.archived && entry.key === edit.key.trim() && entry.scope === edit.scope.trim()
      )
    const conflict = snapshot.memory.entries.some(
      (entry) =>
        !entry.archived &&
        entry.id !== previous?.id &&
        entry.key === edit.key.trim() &&
        entry.scope === edit.scope.trim()
    )
    if (conflict) {
      setError(
        'Another current memory already uses this topic and scope. Choose a different topic.'
      )
      return
    }
    const entry: BotMemoryEntry = {
      ...edit,
      key: edit.key.trim(),
      scope: edit.scope.trim(),
      text: edit.text.trim(),
      id: createBrowserUuid(),
      updatedAt: Date.now(),
      archived: false,
      sources: [{ sessionId: member.sessionId, label: `${channel.name}: user-curated memory` }],
      ...(previous ? { supersedes: previous.id } : {})
    }
    void persist({
      version: 1,
      entries: [
        ...snapshot.memory.entries.map((row) =>
          row.id === previous?.id ? { ...row, archived: true } : row
        ),
        entry
      ]
    })
  }
  const entries =
    snapshot?.memory.entries
      .filter((entry) => entry.archived === archived)
      .toSorted((a, b) => b.updatedAt - a.updatedAt) ?? []
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          onOpenChange(value)
        }
      }}
    >
      <SheetContent motion="theme" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            <Brain className="mr-2 inline size-4" />
            {translate('shamu.memory.title', '{{name}} memory', { name: channel.name })}
          </SheetTitle>
          <SheetDescription>
            {translate(
              'shamu.memory.description',
              'Keep decisions, task state and summaries across long conversations. Relevant notes are recalled when you send a message.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!snapshot || busy}
            onClick={() => {
              setEditing('new')
              setArchived(false)
            }}
          >
            <Plus />
            {translate('shamu.memory.add', 'Add memory')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw />
            {translate('shamu.memory.reload', 'Reload memory')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={archived}
            onClick={() => {
              setArchived(!archived)
              setEditing(null)
            }}
          >
            <Archive />
            {translate('shamu.memory.previous', 'Previous versions')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 scrollbar-sleek">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!snapshot && !error ? (
            <div aria-busy="true" className="space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-24 rounded-xl border border-border bg-muted/30" />
              ))}
            </div>
          ) : null}
          {editing ? (
            <BotMemoryEntryEditor
              key={editing === 'new' ? 'new' : editing.id}
              entry={editing === 'new' ? null : editing}
              busy={busy}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : null}
          {snapshot && !entries.length && !editing ? (
            <div className="space-y-2 rounded-xl border border-border p-5">
              <h3 className="text-sm font-medium">
                {translate('shamu.memory.empty', 'No saved notes yet')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {translate(
                  'shamu.memory.emptyHint',
                  'Add an important decision or ask the bot to organize what it has learned. Your full chat history remains available.'
                )}
              </p>
            </div>
          ) : null}
          {entries.map((entry) => (
            <article key={entry.id} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-medium">{entry.key}</h3>
                  <p className="text-xs text-muted-foreground">
                    {entry.scope} · {translate(`shamu.memory.${entry.kind}`, entry.kind)} ·{' '}
                    {new Date(entry.updatedAt).toLocaleDateString(getIntlLocale())}
                  </p>
                </div>
                {entry.pinned ? <Pin className="size-3.5 text-muted-foreground" /> : null}
                {!archived ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate('shamu.memory.edit', 'Edit memory: {{topic}}', {
                        topic: entry.key
                      })}
                      disabled={busy}
                      onClick={() => setEditing(entry)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate('shamu.memory.archive', 'Archive memory: {{topic}}', {
                        topic: entry.key
                      })}
                      disabled={busy}
                      onClick={() => {
                        if (snapshot) {
                          void persist({
                            ...snapshot.memory,
                            entries: snapshot.memory.entries.map((row) =>
                              row.id === entry.id ? { ...row, archived: true } : row
                            )
                          })
                        }
                      }}
                    >
                      <Archive />
                    </Button>
                  </>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                <BotReferenceText
                  text={entry.text}
                  catalogue={catalogue}
                  disabled={busy || editing !== null}
                  onOpen={() => onOpenChange(false)}
                />
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {entry.sources.map((source) => (
                  <p key={`${source.sessionId}:${source.messageId ?? ''}:${source.label}`}>
                    {translate('shamu.memory.sourceLabel', 'Source:')}{' '}
                    <BotReferenceText
                      text={source.label}
                      catalogue={catalogue}
                      disabled={busy || editing !== null}
                      onOpen={() => onOpenChange(false)}
                    />
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
        <div className="space-y-2 border-t border-border p-5">
          <Button
            variant="outline"
            disabled={!member || busy}
            onClick={() => {
              if (!member) {
                return
              }
              appendToNativeChatComposerDraft(
                structuredAgentSessionDraftScopeKey(member.sessionId),
                {
                  text: 'Organize your durable memory now. Read BOT_MEMORY.md and memory.json in your bot folder. Review this conversation and save grounded facts, current decisions and corrections, active task state (objective, pending work, blockers, next action), and summaries with source references. Archive superseded facts, preserve unrelated notes, and report any gaps. Keep this same chat and do not start another agent.'
                }
              )
              onOpenChange(false)
            }}
          >
            {translate('shamu.memory.review', 'Review with bot')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {translate(
              'shamu.memory.reviewHint',
              'Review the prepared message before sending. Codex or Claude keeps control of context compaction.'
            )}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
