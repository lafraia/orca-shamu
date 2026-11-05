import { z } from 'zod'
import { isValidAutomationSchedule } from './automation-schedule-parsing'

function isSupportedBotCalendar(expression: string): boolean {
  if (expression.includes('=')) {
    const fields = expression
      .trim()
      .split(';')
      .map((part) => part.split('='))
    const keys = fields.map(([key]) => key.toUpperCase())
    if (
      fields.some((parts) => parts.length !== 2) ||
      new Set(keys).size !== keys.length ||
      keys.some((key) => !['FREQ', 'BYDAY', 'BYHOUR', 'BYMINUTE'].includes(key))
    ) {
      return false
    }
    if (keys.includes('BYDAY') && !expression.includes('FREQ=WEEKLY')) {
      return false
    }
    if (keys.includes('BYHOUR') && expression.includes('FREQ=HOURLY')) {
      return false
    }
  }
  return isValidAutomationSchedule(expression)
}

export const botRoutineScheduleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('calendar'),
      expression: z
        .string()
        .max(2048)
        .refine(
          isSupportedBotCalendar,
          'Use a supported five-field cron or recurrence. Use Interval for repeated durations.'
        ),
      timezone: z
        .string()
        .max(128)
        .refine((zone) => {
          try {
            new Intl.DateTimeFormat('en', { timeZone: zone }).format()
            return true
          } catch {
            return false
          }
        })
    })
    .strict(),
  z.object({ kind: z.literal('interval'), minutes: z.number().int().min(1).max(525600) }).strict(),
  z.object({ kind: z.literal('once'), at: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('event'), key: z.string().trim().min(1).max(128) }).strict()
])
export const botRoutineSchema = z
  .object({
    id: z.uuid(),
    botId: z.string().min(1).max(1024),
    name: z.string().trim().min(1).max(100),
    prompt: z.string().trim().min(1).max(40_000),
    schedule: botRoutineScheduleSchema,
    enabled: z.boolean(),
    archived: z.boolean(),
    nextRunAt: z.number().nullable(),
    graceMinutes: z.number().int().min(0).max(1440),
    createdAt: z.number(),
    updatedAt: z.number(),
    lastRunId: z.string().optional()
  })
  .strict()
export type BotRoutine = z.infer<typeof botRoutineSchema>
export type BotRoutineSchedule = z.infer<typeof botRoutineScheduleSchema>
export const botRoutineRunSchema = z
  .object({
    id: z.string(),
    routineId: z.uuid(),
    botId: z.string(),
    scheduledFor: z.number(),
    trigger: z.enum(['scheduled', 'manual', 'event']),
    state: z.enum([
      'prepared',
      'issued',
      'submitted',
      'queued',
      'completed',
      'failed',
      'unconfirmed',
      'skipped_missed',
      'skipped_busy'
    ]),
    sessionId: z.string(),
    operationId: z.string(),
    prompt: z.string(),
    messageId: z.string().optional(),
    error: z.string().optional(),
    requestFingerprint: z.string(),
    createdAt: z.number(),
    updatedAt: z.number()
  })
  .strict()
export type BotRoutineRun = z.infer<typeof botRoutineRunSchema>
export const botRoutineRunSummarySchema = botRoutineRunSchema.omit({
  prompt: true,
  requestFingerprint: true
})
export const botRoutinesSnapshotSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    routines: z.array(botRoutineSchema).max(500)
  })
  .strict()
export type BotRoutinesSnapshot = z.infer<typeof botRoutinesSnapshotSchema>
export const botRoutinesViewSchema = botRoutinesSnapshotSchema.extend({
  runs: z.array(botRoutineRunSummarySchema),
  scheduler: z.enum(['running', 'stopped']),
  error: z.string().optional()
})
export type BotRoutinesView = z.infer<typeof botRoutinesViewSchema>
