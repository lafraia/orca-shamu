import { describe, expect, it } from 'vitest'
import { latestBotRoutineOccurrence, nextBotRoutineOccurrence } from './bot-routine-schedule'
import { botRoutineScheduleSchema } from './bot-routines'

describe('bot routine time zones and clock boundaries', () => {
  it('runs on weekdays in the selected office time zone', () => {
    const after = Date.parse('2026-11-06T15:00:00Z')
    expect(
      nextBotRoutineOccurrence(
        { kind: 'calendar', expression: '0 9 * * 1-5', timezone: 'America/New_York' },
        after,
        0
      )
    ).toBe(Date.parse('2026-11-09T14:00:00Z'))
  })
  it('skips nonexistent spring-forward wall times', () => {
    const after = Date.parse('2026-03-08T05:00:00Z')
    expect(
      nextBotRoutineOccurrence(
        { kind: 'calendar', expression: '30 2 * * *', timezone: 'America/New_York' },
        after,
        0
      )
    ).toBe(Date.parse('2026-03-09T06:30:00Z'))
  })
  it('creates a calendar routine when its local date is still the previous UTC day', () => {
    const created = Date.parse('2026-11-05T03:00:00Z')
    expect(
      nextBotRoutineOccurrence(
        { kind: 'calendar', expression: '0 9 * * 1-5', timezone: 'America/New_York' },
        created,
        created
      )
    ).toBe(Date.parse('2026-11-05T14:00:00Z'))
  })
  it('addresses both occurrences of a repeated fall-back wall time', () => {
    const schedule = {
      kind: 'calendar' as const,
      expression: '30 1 * * *',
      timezone: 'America/New_York'
    }
    const first = nextBotRoutineOccurrence(schedule, Date.parse('2026-11-01T04:00:00Z'), 0)!
    expect(first).toBe(Date.parse('2026-11-01T05:30:00Z'))
    expect(nextBotRoutineOccurrence(schedule, first + 1000, 0)).toBe(
      Date.parse('2026-11-01T06:30:00Z')
    )
  })
  it('keeps intervals on their original anchor and does not repeat one-time work', () => {
    expect(nextBotRoutineOccurrence({ kind: 'interval', minutes: 2 }, 300_000, 1000)).toBe(361_000)
    expect(nextBotRoutineOccurrence({ kind: 'once', at: 1000 }, 1000, 0)).toBeNull()
    expect(nextBotRoutineOccurrence({ kind: 'event', key: 'review' }, 1000, 0)).toBeNull()
  })
  it('finds the latest eligible occurrence for a single catch-up after downtime', () => {
    expect(latestBotRoutineOccurrence({ kind: 'interval', minutes: 1 }, 3600_500, 500)).toBe(
      3600_500
    )
    expect(
      latestBotRoutineOccurrence(
        { kind: 'calendar', expression: '0 9 * * 1-5', timezone: 'America/New_York' },
        Date.parse('2026-11-09T14:10:00Z'),
        0
      )
    ).toBe(Date.parse('2026-11-09T14:00:00Z'))
  })
  it('rejects recurrence fields whose meaning the calendar engine cannot honor', () => {
    expect(
      botRoutineScheduleSchema.safeParse({
        kind: 'calendar',
        expression: 'FREQ=DAILY;INTERVAL=2',
        timezone: 'UTC'
      }).success
    ).toBe(false)
    expect(
      botRoutineScheduleSchema.safeParse({
        kind: 'calendar',
        expression: 'FREQ=DAILY;BYDAY=MO',
        timezone: 'UTC'
      }).success
    ).toBe(false)
    expect(
      botRoutineScheduleSchema.safeParse({
        kind: 'calendar',
        expression: 'FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9;BYMINUTE=15',
        timezone: 'UTC'
      }).success
    ).toBe(true)
  })
})
