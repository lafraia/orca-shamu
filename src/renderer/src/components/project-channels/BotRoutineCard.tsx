import { Archive, Pause, Pencil, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { BotRoutine } from '../../../../shared/bot-routines'
import { describeAutomationSchedule } from '../../../../shared/automation-schedules'
import { formatUiAutomationScheduleDescriptor } from '../automations/automation-schedule-label'
function scheduleLabel(routine: BotRoutine): string {
  const schedule = routine.schedule
  if (schedule.kind === 'calendar') {
    return `${formatUiAutomationScheduleDescriptor(describeAutomationSchedule(schedule.expression))} (${schedule.timezone})`
  }
  if (schedule.kind === 'interval') {
    return translate('shamu.routines.everyMinutes', 'Every {{minutes}} minutes', {
      minutes: schedule.minutes
    })
  }
  if (schedule.kind === 'event') {
    return translate('shamu.routines.onEvent', 'On event: {{name}}', { name: schedule.key })
  }
  return new Date(schedule.at).toLocaleString(getIntlLocale())
}

export function BotRoutineCard({
  routine,
  busy,
  onEdit,
  onControl
}: {
  routine: BotRoutine
  busy: boolean
  onEdit: () => void
  onControl: (control: 'pause' | 'resume' | 'run' | 'archive') => void
}): React.JSX.Element {
  return (
    <article className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium">{routine.name}</h3>
          <p className="text-xs text-muted-foreground">{scheduleLabel(routine)}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {routine.enabled
            ? translate('shamu.routines.active', 'Active')
            : translate('shamu.routines.paused', 'Paused')}
        </span>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-sm">{routine.prompt}</p>
      {routine.enabled && routine.nextRunAt !== null ? (
        <p className="text-xs text-muted-foreground">
          {translate('shamu.routines.next', 'Next: {{date}}', {
            date: new Date(routine.nextRunAt).toLocaleString(
              getIntlLocale(),
              routine.schedule.kind === 'calendar'
                ? { timeZone: routine.schedule.timezone }
                : undefined
            )
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" size="xs" disabled={busy} onClick={() => onControl('run')}>
          <Play />
          {translate('shamu.routines.run', 'Run now')}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => onControl(routine.enabled ? 'pause' : 'resume')}
        >
          {routine.enabled ? <Pause /> : <Play />}
          {routine.enabled
            ? translate('shamu.routines.pause', 'Pause')
            : translate('shamu.routines.resume', 'Resume')}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          aria-label={translate('shamu.routines.edit', 'Edit routine: {{name}}', {
            name: routine.name
          })}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          aria-label={translate('shamu.routines.archive', 'Archive routine: {{name}}', {
            name: routine.name
          })}
          onClick={() => onControl('archive')}
        >
          <Archive />
        </Button>
      </div>
    </article>
  )
}
