import { z } from 'zod'
import { botMentionRequestSchema } from '../../shared/bot-mentions'
import { botReferenceContextSchema } from './bot-journal-reader'

export const botMentionOriginSchema = z.object({
  actorId: z.string().min(1).max(1024),
  sourceItemId: z.string().min(1).max(1024)
})
export type BotMentionOrigin = z.infer<typeof botMentionOriginSchema>

export const botMentionReceiptSchema = z.object({
  botId: z.string(),
  name: z.string(),
  state: z.enum(['ready', 'issued', 'recorded', 'refused', 'unconfirmed', 'self']),
  operationId: z.string().regex(/^\d{13}-[0-9a-f]{32}$/),
  sessionId: z.string(),
  message: z.string().optional()
})

export const botMentionRecordSchema = z.object({
  version: z.literal(1),
  fingerprint: z.string(),
  request: botMentionRequestSchema,
  receipts: z.array(botMentionReceiptSchema),
  context: botReferenceContextSchema.optional(),
  createdAt: z.number().optional(),
  origin: botMentionOriginSchema.optional()
})
export type BotMentionRecord = z.infer<typeof botMentionRecordSchema>
