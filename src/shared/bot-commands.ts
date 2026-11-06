import { z } from 'zod'
import { botMentionRequestSchema } from './bot-mentions'
import { botRoutineSchema } from './bot-routines'
import { JournalCursor } from './rpc-contract/structured-agent-session-params'
import { botSectionNameSchema } from './bot-sections'
import { vaultAgentCommandSchema } from './shamu-vault'
import { botRosterMoveSchema } from './bot-roster-move'

const id = z.string().min(1).max(1024)
export const botRunRequestIdSchema = z.string().regex(/^\d{13}-[0-9a-f]{32}$/)
export const botCreateCommandSchema = z
  .object({
    action: z.literal('create'),
    requestId: z.uuid(),
    actorId: id,
    sourceItemId: id,
    name: z.string().trim().min(1).max(80),
    instructions: z.string().trim().max(20_000).default(''),
    section: z.string().trim().max(80).optional()
  })
  .strict()
export const botCommandSchema = z.discriminatedUnion('action', [
  vaultAgentCommandSchema,
  z.object({ action: z.literal('list') }).strict(),
  botCreateCommandSchema,
  z
    .object({
      action: z.literal('reorder'),
      move: botRosterMoveSchema,
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('organize'),
      botId: id,
      pinned: z.boolean().optional(),
      section: z.string().trim().max(80).optional(),
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('section.rename'),
      name: botSectionNameSchema,
      newName: botSectionNameSchema.min(1),
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('section.move'),
      name: botSectionNameSchema,
      direction: z.enum(['up', 'down']),
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('context'),
      actorId: id,
      referenceId: id,
      cursor: JournalCursor.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('mention'),
      request: botMentionRequestSchema,
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z.object({ action: z.literal('routine.list'), botId: id.optional() }).strict(),
  z
    .object({
      action: z.literal('routine.save'),
      routine: botRoutineSchema,
      revision: z.number().int().nonnegative(),
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('routine.control'),
      id: z.uuid(),
      control: z.enum(['pause', 'resume', 'run', 'archive', 'acknowledge']),
      requestId: botRunRequestIdSchema,
      actorId: id.optional(),
      sourceItemId: id.optional()
    })
    .strict(),
  z
    .object({
      action: z.literal('routine.trigger'),
      key: z.string().trim().min(1).max(128),
      eventId: botRunRequestIdSchema,
      text: z.string().max(20_000).optional()
    })
    .strict()
])
export type BotCommand = z.infer<typeof botCommandSchema>
export type BotCreateCommand = z.infer<typeof botCreateCommandSchema>
