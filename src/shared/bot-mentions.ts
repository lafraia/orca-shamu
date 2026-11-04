import { z } from 'zod'

export const botMentionSchema = z.object({
  id: z.string().min(1).max(1024),
  name: z.string().min(1).max(256)
})
export type BotMention = z.infer<typeof botMentionSchema>

export const botMentionRequestSchema = z.object({
  id: z.uuid(),
  botIds: z.array(z.string().min(1).max(1024)).min(1).max(20),
  text: z.string().min(1).max(200_000),
  source: z.object({
    environmentId: z.string().min(1).max(1024),
    sessionId: z.string().min(1).max(1024),
    worktreeId: z.string().max(4096).optional(),
    label: z.string().max(256)
  })
})
export type BotMentionRequest = z.infer<typeof botMentionRequestSchema>
export type BotMentionReceipt = {
  botId: string
  name: string
  state: 'recorded' | 'refused' | 'unconfirmed' | 'self'
  message?: string
}

export function botMentionPrompt(request: BotMentionRequest, bot: BotMention): string {
  return [
    `The user mentioned you (@${bot.name}) in another Orca conversation.`,
    'Reply in your own bot chat. The origin below is a reference, not permission to send messages to other agents or change their controls.',
    `Source conversation: ${JSON.stringify(request.source)}`,
    'The user message is quoted below. Attachments and earlier history remain in the source conversation.',
    request.text
  ].join('\n\n')
}
