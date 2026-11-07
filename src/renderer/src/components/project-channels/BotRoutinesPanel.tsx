import { useEffect, useState } from 'react'
import { CalendarClock, Plus, RefreshCw } from 'lucide-react'
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
import { createStructuredAgentSessionOperationId } from '../../../../shared/agent-session/lifecycle/structured-agent-session-mutation'
import {
  botRoutinesViewSchema,
  type BotRoutine,
  type BotRoutinesView
} from '../../../../shared/bot-routines'
import type { BotCommand } from '../../../../shared/bot-commands'
import { BotRoutineCard } from './BotRoutineCard'
import { BotRoutineEditor } from './BotRoutineEditor'

export function BotRoutinesPanel({
  botId,
  name,
  open,
  onOpenChange
}: {
  botId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [view, setView] = useState<BotRoutinesView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState<{ routine: BotRoutine | null; revision: number } | null>(
    null
  )
  useEffect(() => {
    if (!open) {
      return
    }
    let current = true
    setView(null)
    setError(null)
    const refresh = (): void => {
      void window.api
        .projectChannels!.command({ action: 'routine.list', botId })
        .then((result) => {
          if (current) {
            setView(botRoutinesViewSchema.parse(result))
          }
        })
        .catch((failure: unknown) => {
          if (current) {
            setError(failure instanceof Error ? failure.message : 'Could not load routines.')
          }
        })
    }
    refresh()
    const timer = setInterval(refresh, 15_000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [botId, attempt, open])
  const mutate = async (command: BotCommand): Promise<void> => {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      setView(botRoutinesViewSchema.parse(await window.api.projectChannels!.command(command)))
      setEditing(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update this routine.')
    } finally {
      setBusy(false)
    }
  }
  const control = (
    id: string,
    control: 'pause' | 'resume' | 'run' | 'archive' | 'acknowledge'
  ): void => {
    void mutate({
      action: 'routine.control',
      id,
      control,
      requestId: createStructuredAgentSessionOperationId(createBrowserUuid)
    })
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next)
        }
      }}
    >
      <SheetContent
        motion="theme"
        className="w-full sm:max-w-xl"
        onCloseAutoFocus={() => {
          setView(null)
          setError(null)
          setEditing(null)
        }}
      >
        <SheetHeader>
          <SheetTitle>
            <CalendarClock className="mr-2 inline size-4" />
            {translate('shamu.routines.title', '{{name}} routines', { name })}
          </SheetTitle>
          <SheetDescription>
            {translate(
              'shamu.routines.description',
              'Recurring work returns to this same bot chat.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 border-y border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!view || busy}
            onClick={() => view && setEditing({ routine: null, revision: view.revision })}
          >
            <Plus />
            {translate('shamu.routines.add', 'Add routine')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setError(null)
              setAttempt((value) => value + 1)
            }}
          >
            <RefreshCw />
            {translate('shamu.routines.reload', 'Reload routines')}
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-sleek">
          {error || view?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {error ?? view?.error}
            </p>
          ) : null}
          {!view && !error ? (
            <div aria-busy="true" className="space-y-3">
              {[0, 1].map((index) => (
                <div key={index} className="h-28 rounded-xl border border-border bg-muted/30" />
              ))}
            </div>
          ) : null}
          {editing ? (
            <BotRoutineEditor
              key={editing.routine?.id ?? 'new'}
              routine={editing.routine}
              botId={botId}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(routine) =>
                void mutate({ action: 'routine.save', routine, revision: editing.revision })
              }
            />
          ) : null}
          {view && !view.routines.length && !editing ? (
            <div className="space-y-2 rounded-xl border border-border p-5">
              <h3 className="text-sm font-medium">
                {translate('shamu.routines.empty', 'No routines yet')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {translate(
                  'shamu.routines.emptyHint',
                  'Schedule a workflow here, or ask the bot to create a routine in this chat.'
                )}
              </p>
            </div>
          ) : null}
          {view?.routines.map((routine) => (
            <BotRoutineCard
              key={routine.id}
              routine={routine}
              busy={busy}
              onEdit={() => setEditing({ routine, revision: view.revision })}
              onControl={(action) => control(routine.id, action)}
            />
          ))}
          {view?.runs.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                {translate('shamu.routines.history', 'Run history')}
              </h3>
              {view.runs.map((run) => (
                <article key={run.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex justify-between gap-3 text-xs">
                    <span>
                      {view.routines.find((routine) => routine.id === run.routineId)?.name ??
                        translate('shamu.routines.archived', 'Archived routine')}
                    </span>
                    <span>
                      {translate(
                        `shamu.routines.state.${run.state}`,
                        run.state.replaceAll('_', ' ')
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(run.scheduledFor).toLocaleString(getIntlLocale())}
                  </p>
                  {run.error ? <p className="text-xs text-destructive">{run.error}</p> : null}
                  {run.state === 'unconfirmed' &&
                  view.routines.some((routine) => routine.lastRunId === run.id) ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {translate(
                          'shamu.routines.uncertain',
                          'Check the bot chat before allowing future runs. This delivery will not be sent again automatically.'
                        )}
                      </p>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy}
                        onClick={() => control(run.routineId, 'acknowledge')}
                      >
                        {translate('shamu.routines.acknowledge', 'Allow next run')}
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </div>
        <footer className="space-y-2 border-t border-border p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {translate('shamu.routines.openChat', 'Open bot chat')}
          </Button>
          <p role="status" className="text-xs text-muted-foreground">
            {busy
              ? translate('shamu.routines.updating', 'Updating routine…')
              : translate(
                  'shamu.routines.localScheduler',
                  'Local scheduler. Keep Shamu and the primary Orca running. You can minimize the window. Quitting the app or sleeping the computer pauses execution.'
                )}
          </p>
        </footer>
      </SheetContent>
    </Sheet>
  )
}
