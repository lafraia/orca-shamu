import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BotRoutineCadenceSelect, BotRoutineWeekdaySelect } from './BotRoutineScheduleSelects'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { botRoutineSchema, type BotRoutine } from '../../../../shared/bot-routines'
import { buildAutomationCronSchedule } from '../../../../shared/automation-schedule-occurrences'
import { describeAutomationSchedule } from '../../../../shared/automation-schedules'

function dateInputValue(epoch: number): string {
  const date = new Date(epoch)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function BotRoutineEditor({
  routine,
  botId,
  busy,
  onSave,
  onCancel
}: {
  routine: BotRoutine | null
  botId: string
  busy: boolean
  onSave: (routine: BotRoutine) => void
  onCancel: () => void
}): React.JSX.Element {
  const [id] = useState(routine?.id ?? createBrowserUuid())
  const [name, setName] = useState(routine?.name ?? '')
  const [prompt, setPrompt] = useState(routine?.prompt ?? '')
  const initial =
    routine?.schedule.kind === 'calendar'
      ? describeAutomationSchedule(routine.schedule.expression)
      : null
  const [cadence, setCadence] = useState<string>(
    routine?.schedule.kind === 'calendar'
      ? initial?.kind === 'invalid'
        ? 'custom'
        : (initial?.kind ?? 'custom')
      : (routine?.schedule.kind ?? 'weekdays')
  )
  const [time, setTime] = useState(
    initial && 'minute' in initial
      ? `${String('hour' in initial ? initial.hour : 9).padStart(2, '0')}:${String(initial.minute).padStart(2, '0')}`
      : '09:00'
  )
  const [day, setDay] = useState(initial?.kind === 'weekly' ? initial.dayOfWeek : 1)
  const [zone, setZone] = useState(
    routine?.schedule.kind === 'calendar'
      ? routine.schedule.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [expression, setExpression] = useState(
    routine?.schedule.kind === 'calendar' ? routine.schedule.expression : '0 9 * * 1-5'
  )
  const [minutes, setMinutes] = useState(
    routine?.schedule.kind === 'interval' ? routine.schedule.minutes : 120
  )
  const [once, setOnce] = useState(() =>
    dateInputValue(routine?.schedule.kind === 'once' ? routine.schedule.at : Date.now() + 3600_000)
  )
  const [eventKey, setEventKey] = useState(
    routine?.schedule.kind === 'event' ? routine.schedule.key : ''
  )
  const [grace, setGrace] = useState(routine?.graceMinutes ?? 60)
  const [error, setError] = useState<string | null>(null)
  const save = (): void => {
    const [hour, minute] = time.split(':').map(Number)
    const schedule =
      cadence === 'interval'
        ? { kind: 'interval', minutes }
        : cadence === 'once'
          ? { kind: 'once', at: new Date(once).getTime() }
          : cadence === 'event'
            ? { kind: 'event', key: eventKey }
            : {
                kind: 'calendar',
                timezone: zone,
                expression:
                  cadence === 'custom'
                    ? expression
                    : buildAutomationCronSchedule({
                        preset:
                          cadence === 'hourly'
                            ? 'hourly'
                            : cadence === 'daily'
                              ? 'daily'
                              : cadence === 'weekly'
                                ? 'weekly'
                                : 'weekdays',
                        hour,
                        minute,
                        dayOfWeek: day
                      })
              }
    const parsed = botRoutineSchema.safeParse({
      id,
      botId,
      name,
      prompt,
      schedule,
      enabled: routine?.enabled ?? true,
      archived: false,
      nextRunAt: routine?.nextRunAt ?? null,
      graceMinutes: grace,
      createdAt: routine?.createdAt ?? 0,
      updatedAt: routine?.updatedAt ?? 0
    })
    if (!parsed.success) {
      setError('Check the routine name, instructions, schedule and time zone.')
      return
    }
    onSave(parsed.data)
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) {
          save()
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="bot-routine-name">{translate('shamu.routines.name', 'Routine name')}</Label>
        <Input
          id="bot-routine-name"
          value={name}
          maxLength={100}
          autoFocus
          required
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bot-routine-prompt">
          {translate('shamu.routines.instructions', 'Routine instructions')}
        </Label>
        <Textarea
          id="bot-routine-prompt"
          rows={4}
          maxLength={40_000}
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={translate(
            'shamu.routines.promptHint',
            'Steps, current sources, expected result and what needs your approval.'
          )}
        />
      </div>
      <BotRoutineCadenceSelect value={cadence} onChange={setCadence} />
      {['weekdays', 'daily', 'weekly', 'hourly'].includes(cadence) ? (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-time">{translate('shamu.routines.time', 'Time')}</Label>
          <Input
            id="bot-routine-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </div>
      ) : null}
      {cadence === 'weekly' ? <BotRoutineWeekdaySelect value={day} onChange={setDay} /> : null}
      {cadence === 'custom' ? (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-expression">
            {translate('shamu.routines.expression', 'Cron or RRULE')}
          </Label>
          <Input
            id="bot-routine-expression"
            variant="code"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            required
          />
        </div>
      ) : null}
      {['weekdays', 'daily', 'weekly', 'hourly', 'custom'].includes(cadence) ? (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-zone">{translate('shamu.routines.zone', 'Time zone')}</Label>
          <Input
            id="bot-routine-zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            required
          />
        </div>
      ) : null}
      {cadence === 'interval' ? (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-interval">
            {translate('shamu.routines.minutes', 'Interval in minutes')}
          </Label>
          <Input
            id="bot-routine-interval"
            type="number"
            min={1}
            max={525600}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            required
          />
        </div>
      ) : null}
      {cadence === 'once' ? (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-once">
            {translate('shamu.routines.onceAt', 'Date and time on this computer')}
          </Label>
          <Input
            id="bot-routine-once"
            type="datetime-local"
            value={once}
            onChange={(event) => setOnce(event.target.value)}
            required
          />
        </div>
      ) : null}
      {cadence === 'event' ? (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-event">
            {translate('shamu.routines.eventKey', 'Event name')}
          </Label>
          <Input
            id="bot-routine-event"
            variant="code"
            value={eventKey}
            onChange={(event) => setEventKey(event.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            {translate(
              'shamu.routines.eventHint',
              'A local integration triggers this named event through the Shamu bot command.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="bot-routine-grace">
            {translate('shamu.routines.grace', 'Catch up within (minutes)')}
          </Label>
          <Input
            id="bot-routine-grace"
            type="number"
            min={0}
            max={1440}
            value={grace}
            onChange={(event) => setGrace(Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            {translate(
              'shamu.routines.graceHint',
              'After downtime, run at most once within this window.'
            )}
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {translate('projectChannels.cancel', 'Cancel')}
        </Button>
        <Button disabled={busy || !name.trim() || !prompt.trim()}>
          {translate('shamu.routines.save', 'Save routine')}
        </Button>
      </div>
    </form>
  )
}
