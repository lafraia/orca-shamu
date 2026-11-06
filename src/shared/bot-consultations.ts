import { z } from 'zod'

const id = z.string().min(1).max(1024)

export const botAskSchema = z
  .object({
    action: z.literal('ask'),
    requestId: z.uuid(),
    actorId: id,
    sourceItemId: id,
    botId: id,
    text: z.string().trim().min(1).max(20_000)
  })
  .strict()

export const botAskResultSchema = z
  .object({
    action: z.literal('ask.result'),
    requestId: z.uuid(),
    actorId: id,
    waitSeconds: z.number().int().min(0).max(30).default(0)
  })
  .strict()

export const BOT_CONSULTATION_GUIDANCE =
  'You own the user-facing conversation. A mention of another bot in a user request is addressed to you, not automatically forwarded. When asked to consult a bot, formulate your own focused first-person question as yourself using bots ask from BOT_TOOLS.md. Send only the necessary task context, not a verbatim copy of the user request or their conversation. Read bots ask-result for that same request, wait for its actual completed response, then synthesize an answer for the user in your own voice. Delivery confirmation, commentary and queued/running states are not the answer. Do not claim that a mention already contacted a bot. Keep follow-up questions in the same bounded delegated task, do not start messaging loops, and do not expand the original user authorization.'
