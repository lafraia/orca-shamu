import { z } from 'zod'
import { readBotTurnPrompt } from '../../shared/bot-turn-context'
import { JournalCursor } from '../../shared/rpc-contract/structured-agent-session-identifiers'
import { isAdmissibleAgentJournalRenderItem } from '../../shared/agent-session/journal/agent-session-journal-schemas'
import { isAdmissibleAgentJournalSubmission } from '../../shared/agent-session/journal/agent-session-journal-submission-schema'
import type { ShamuPrimaryConnection } from '../shamu-primary-connection'

export type BotPrimary = Pick<ShamuPrimaryConnection, 'read' | 'call'>
export const botJournalPageSchema = z.object({
  ok: z.literal(true),
  page: z.object({
    sessionId: z.string(),
    epoch: z.string(),
    fence: z.number().optional(),
    items: z.array(z.unknown()),
    submissions: z.array(z.unknown()).default([]),
    queuedMessages: z
      .array(z.object({ messageId: z.string(), state: z.enum(['waiting', 'returned']) }))
      .nullable()
      .optional(),
    window: z.object({
      oldest: JournalCursor.nullable(),
      newest: JournalCursor.nullable(),
      nextCursor: JournalCursor
    }),
    hasOlder: z.boolean()
  })
})
const messageBody = z.object({
  kind: z.literal('message'),
  role: z.enum(['user', 'assistant']),
  blocks: z.array(z.unknown()),
  from: z.unknown().optional()
})
const textBlock = z.object({ type: z.literal('text'), text: z.string() })
const imageBlock = z.object({
  type: z.literal('image-ref'),
  path: z.string().max(4096).optional(),
  url: z.string().max(4096).optional(),
  alt: z.string().optional()
})
export const botReferenceContextSchema = z.object({
  capturedAt: z.number(),
  sessionId: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      text: z.string(),
      truncated: z.boolean().optional(),
      at: z.number(),
      attachments: z.array(imageBlock).optional()
    })
  ),
  before: JournalCursor.nullable(),
  hasOlder: z.boolean()
})
export type BotReferenceContext = z.infer<typeof botReferenceContextSchema>

export async function readBotJournal(
  primary: BotPrimary,
  sessionId: string,
  cursor?: z.infer<typeof JournalCursor>
) {
  const { page } = botJournalPageSchema.parse(
    await primary.call('agentSession.history', {
      sessionId,
      direction: cursor ? 'before' : 'tail',
      ...(cursor ? { cursor } : {}),
      limit: 100
    })
  )
  if (page.sessionId !== sessionId) {
    throw new Error('The primary returned another conversation.')
  }
  return {
    page,
    snapshot: {
      sessionId,
      cursor: page.window.newest ?? page.window.nextCursor,
      items: page.items.filter(isAdmissibleAgentJournalRenderItem),
      submissions: page.submissions.filter(isAdmissibleAgentJournalSubmission)
    }
  }
}

export async function readBotReferenceContext(
  primary: BotPrimary,
  sessionId: string,
  cursor?: z.infer<typeof JournalCursor>
): Promise<BotReferenceContext> {
  const { page, snapshot } = await readBotJournal(primary, sessionId, cursor)
  let remaining = 24_000
  let oldest = page.window.oldest
  let omitted = false
  const messages: BotReferenceContext['messages'] = []
  for (const item of snapshot.items.toReversed()) {
    const parsed = messageBody.safeParse(item.body)
    if (item.agentId || !parsed.success) {
      continue
    }
    if (remaining <= 1024 || messages.length >= 20) {
      omitted = true
      break
    }
    const content = parsed.data.blocks
      .flatMap((block) => {
        const parsed = textBlock.safeParse(block)
        return parsed.success ? [parsed.data.text] : []
      })
      .join('\n')
    const visible = readBotTurnPrompt(content)?.message ?? content
    const text = visible.slice(-Math.min(Math.max(0, remaining - 1024), 8000))
    const attachments = parsed.data.blocks
      .flatMap((block) => {
        const parsed = imageBlock.safeParse(block)
        return parsed.success ? [parsed.data] : []
      })
      .slice(0, 3)
    if (!text && !attachments.length) {
      continue
    }
    const message: BotReferenceContext['messages'][number] = {
      id: item.itemId,
      role: parsed.data.role,
      text,
      ...(visible.length > text.length ? { truncated: true } : {}),
      at: item.observedAt
    }
    while (JSON.stringify(message).length > remaining && message.text.length > 0) {
      message.text = message.text.slice(Math.ceil(message.text.length / 2))
      message.truncated = true
    }
    if (JSON.stringify(message).length > remaining) {
      omitted = true
      break
    }
    if (attachments.length && JSON.stringify({ ...message, attachments }).length <= remaining) {
      message.attachments = attachments
    } else if (attachments.length) {
      message.truncated = true
    }
    remaining -= JSON.stringify(message).length
    oldest = { epoch: page.epoch, sequence: item.sequence }
    messages.unshift(message)
  }
  return {
    capturedAt: Date.now(),
    sessionId,
    messages,
    before: oldest,
    hasOlder: page.hasOlder || omitted
  }
}

export async function requireBotUserRequest(
  primary: BotPrimary,
  sessionId: string,
  itemId: string
): Promise<string> {
  const result = z
    .object({ item: z.object({ body: z.unknown(), agentId: z.unknown().optional() }).nullable() })
    .parse(await primary.call('agentSession.item', { sessionId, itemId }))
  const body = messageBody.safeParse(result.item?.body)
  if (
    !body.success ||
    result.item?.agentId !== undefined ||
    body.data.role !== 'user' ||
    body.data.from !== undefined
  ) {
    throw new Error('Use the source item ID of the user request that authorized this action.')
  }
  return body.data.blocks
    .flatMap((block) => {
      const parsed = textBlock.safeParse(block)
      return parsed.success ? [parsed.data.text] : []
    })
    .join('\n')
}
