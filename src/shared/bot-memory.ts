import { z } from 'zod'

export const botMemorySourceSchema = z
  .object({
    sessionId: z.string().min(1).max(1024),
    messageId: z.string().max(1024).optional(),
    label: z.string().min(1).max(256)
  })
  .strict()
export const botMemoryEntrySchema = z
  .object({
    id: z.uuid(),
    key: z.string().trim().min(1).max(120),
    kind: z.enum(['fact', 'task', 'summary']),
    scope: z.string().trim().min(1).max(256),
    text: z.string().trim().min(1).max(8000),
    sources: z.array(botMemorySourceSchema).min(1).max(20),
    pinned: z.boolean(),
    updatedAt: z.number().finite(),
    supersedes: z.uuid().optional(),
    archived: z.boolean()
  })
  .strict()
export const botMemorySchema = z
  .object({
    version: z.literal(1),
    entries: z.array(botMemoryEntrySchema).max(2000)
  })
  .strict()
  .superRefine(({ entries }, ctx) => {
    const active = entries
      .filter((entry) => !entry.archived)
      .map((entry) => `${entry.scope}\0${entry.key}`)
    if (
      new Set(entries.map((entry) => entry.id)).size !== entries.length ||
      new Set(active).size !== active.length
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Memory identifiers and current keys must be unique.'
      })
    }
  })
export type BotMemory = z.infer<typeof botMemorySchema>
export type BotMemoryEntry = z.infer<typeof botMemoryEntrySchema>
export type BotMemorySnapshot = { memory: BotMemory; fingerprint: string }
export type BotMemorySelection = { entries: BotMemoryEntry[]; omitted: number; characters: number }
export const BOT_MEMORY_CONTEXT_CHARACTERS = 12_000

export function selectBotMemory(memory: BotMemory, query: string): BotMemorySelection {
  const words = new Set(
    query
      .slice(-4000)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.slice(-64) ?? []
  )
  const current = memory.entries.filter((entry) => !entry.archived)
  const ranked = current
    .map((entry) => {
      const haystack = `${entry.key} ${entry.scope} ${entry.text}`
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
      const matches = [...words].filter((word) => haystack.includes(word)).length
      return {
        entry,
        score: matches * 10 + (entry.pinned ? 1000 : 0) + (entry.kind === 'task' ? 2 : 0)
      }
    })
    .filter(({ entry, score }) => score > 0 || entry.kind === 'summary')
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.updatedAt - a.entry.updatedAt ||
        a.entry.id.localeCompare(b.entry.id)
    )
  const entries: BotMemoryEntry[] = []
  let characters = 0
  for (const { entry } of ranked) {
    const size = JSON.stringify(entry).length
    if (characters + size <= BOT_MEMORY_CONTEXT_CHARACTERS) {
      entries.push(entry)
      characters += size
    }
  }
  return { entries, characters, omitted: current.length - entries.length }
}
