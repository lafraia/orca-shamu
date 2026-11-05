import { z } from 'zod'
import { JournalCursor } from './rpc-contract/structured-agent-session-identifiers'

export const botReadMarkSchema = z
  .object({
    botId: z.string().min(1).max(1024),
    environmentId: z.string().min(1).max(1024),
    sessionId: z.string().min(1).max(1024),
    cursor: JournalCursor
  })
  .strict()
export type BotReadMark = z.infer<typeof botReadMarkSchema>
export type BotUnreadSnapshot = { counts: Record<string, number>; pending: string[] }
export const botUnreadSnapshotSchema = z.object({
  counts: z.record(z.string(), z.number().int().min(0).max(100)),
  pending: z.array(z.string())
})
