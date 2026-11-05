import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

export function BotRoutineCadenceSelect({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="bot-routine-cadence">{translate('shamu.routines.when', 'When to run')}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="bot-routine-cadence">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[
            ['weekdays', 'Every weekday'],
            ['daily', 'Every day'],
            ['weekly', 'Every week'],
            ['hourly', 'Every hour'],
            ['interval', 'At an interval'],
            ['once', 'Once'],
            ['event', 'On a named event'],
            ['custom', 'Custom schedule']
          ].map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {translate(`shamu.routines.${value}`, label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
export function BotRoutineWeekdaySelect({
  value,
  onChange
}: {
  value: number
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="bot-routine-day">{translate('shamu.routines.day', 'Day of week')}</Label>
      <Select value={String(value)} onValueChange={(value) => onChange(Number(value))}>
        <SelectTrigger id="bot-routine-day">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
            (label, index) => (
              <SelectItem key={label} value={String(index)}>
                {translate(`shamu.routines.day.${index}`, label)}
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
