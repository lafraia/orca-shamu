import { z } from 'zod'
import { botSectionNameSchema } from './bot-sections'

const placement = z.enum(['before', 'after'])
export const botRosterMoveSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('section'),
      section: botSectionNameSchema,
      targetSection: botSectionNameSchema,
      placement
    })
    .strict(),
  z
    .object({
      kind: z.literal('bot'),
      botId: z.string().min(1).max(1024),
      section: botSectionNameSchema.nullable(),
      relativeTo: z.string().min(1).max(1024).optional(),
      placement
    })
    .strict()
])

export type BotRosterMove = z.infer<typeof botRosterMoveSchema>
