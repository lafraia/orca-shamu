import { parseSchedule } from './automation-schedule-parsing'
import type { BotRoutineSchedule } from './bot-routines'

const MINUTE = 60_000
const DAY = 86_400_000
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function calendarOccurrence(
  schedule: BotRoutineSchedule,
  after: number,
  anchor: number,
  direction: 1 | -1
): number | null {
  if (schedule.kind === 'event') {
    return null
  }
  if (schedule.kind === 'once') {
    return (direction === 1 ? schedule.at > after : schedule.at <= after && schedule.at >= anchor)
      ? schedule.at
      : null
  }
  if (schedule.kind === 'interval') {
    const duration = schedule.minutes * MINUTE
    const occurrence = Math.floor((after - anchor) / duration) + (direction === 1 ? 1 : 0)
    return direction === -1 && occurrence < 1 ? null : anchor + Math.max(1, occurrence) * duration
  }
  const rule = parseSchedule(schedule.expression)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: schedule.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const wallTime = (epoch: number): number => {
    const parts = new Map(
      formatter.formatToParts(epoch).map((part) => [part.type, Number(part.value)])
    )
    return Date.UTC(
      parts.get('year')!,
      parts.get('month')! - 1,
      parts.get('day')!,
      parts.get('hour')!,
      parts.get('minute')!
    )
  }
  const wallNow = wallTime(after)
  const firstDay = Math.floor(wallNow / DAY) * DAY
  const hours =
    rule.kind === 'cron'
      ? [...rule.hours].toSorted((a, b) => a - b)
      : rule.freq === 'HOURLY'
        ? Array.from({ length: 24 }, (_, index) => index)
        : [rule.byHour]
  const minutes =
    rule.kind === 'cron' ? [...rule.minutes].toSorted((a, b) => a - b) : [rule.byMinute]
  for (
    let day = firstDay;
    Math.abs(day - firstDay) <= DAY * 9 * 366 && (direction === 1 || day + 2 * DAY > anchor);
    day += DAY * direction
  ) {
    const date = new Date(day)
    if (rule.kind === 'cron') {
      if (!rule.months.has(date.getUTCMonth() + 1)) {
        continue
      }
      const monthDay = rule.daysOfMonth.has(date.getUTCDate())
      const weekDay = rule.daysOfWeek.has(date.getUTCDay())
      if (
        rule.dayOfMonthRestricted && rule.dayOfWeekRestricted
          ? !monthDay && !weekDay
          : !monthDay || !weekDay
      ) {
        continue
      }
    } else if (rule.freq === 'WEEKLY' && !rule.byDay.includes(DAY_CODES[date.getUTCDay()])) {
      continue
    }
    const offsets = new Set([day - DAY, day, day + DAY].map((epoch) => wallTime(epoch) - epoch))
    const candidates: number[] = []
    for (const hour of hours) {
      for (const minute of minutes) {
        const wall = day + hour * 60 * MINUTE + minute * MINUTE
        for (const offset of offsets) {
          const epoch = wall - offset
          if (
            (direction === 1 ? epoch > after : epoch <= after) &&
            epoch >= anchor &&
            wallTime(epoch) === wall
          ) {
            candidates.push(epoch)
          }
        }
      }
    }
    const next = candidates.toSorted((a, b) => (a - b) * direction)[0]
    if (next !== undefined) {
      return next
    }
  }
  if (direction === -1) {
    return null
  }
  throw new Error('No routine occurrence was found within nine years.')
}

export function nextBotRoutineOccurrence(
  schedule: BotRoutineSchedule,
  after: number,
  anchor: number
): number | null {
  return calendarOccurrence(schedule, after, anchor, 1)
}
export function latestBotRoutineOccurrence(
  schedule: BotRoutineSchedule,
  before: number,
  anchor: number
): number | null {
  return calendarOccurrence(schedule, before, anchor, -1)
}
