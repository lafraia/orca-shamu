import { z } from 'zod'

export const botCliSendSchema = z
  .object({
    action: z.literal('send'),
    requestId: z.uuid(),
    bot: z.string().trim().min(1).max(1024),
    text: z
      .string()
      .min(1)
      .max(20_000)
      .refine((text) => text.trim().length > 0),
    sender: z.string().trim().min(1).max(80).default('CLI')
  })
  .strict()
export const botCliResultSchema = z
  .object({ action: z.literal('result'), requestId: z.uuid() })
  .strict()
export const botCliReceiptSchema = z.object({
  version: z.literal(1),
  request: botCliSendSchema,
  fingerprint: z.string(),
  botId: z.string(),
  botName: z.string(),
  sessionId: z.string(),
  environmentId: z.string(),
  operationId: z.string().regex(/^\d{13}-[0-9a-f]{32}$/),
  messageId: z.string().optional(),
  prompt: z.string(),
  state: z.enum(['prepared', 'issued', 'queued', 'submitted', 'refused', 'unconfirmed']),
  error: z.string().optional(),
  createdAt: z.number()
})
export type BotCliSend = z.infer<typeof botCliSendSchema>
export type BotCliReceipt = z.infer<typeof botCliReceiptSchema>

export function botCliPromptText(
  request: Pick<BotCliSend, 'sender' | 'requestId' | 'text'>
): string {
  return `Received from CLI (${JSON.stringify(request.sender)}). Request reference: ${request.requestId}.\n\n${request.text}`
}
