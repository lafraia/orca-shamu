import { z } from 'zod'
import { botMemoryEntrySchema, botMemorySelectionDetailsSchema } from './bot-memory'

const START = '[Orca Shamu bot context v1]\n'
const END = '\n[/Orca Shamu bot context]\n\n'
const contextSchema = z.object({
  identity: z.object({ id: z.string(), name: z.string(), instructions: z.string() }),
  memoryFile: z.string(),
  memoryGuide: z.string(),
  guidance: z.string(),
  entries: z.array(botMemoryEntrySchema),
  omitted: z.number().int().nonnegative(),
  selection: botMemorySelectionDetailsSchema.optional()
})
export type BotTurnContext = z.infer<typeof contextSchema>

export function botTurnPrompt(context: BotTurnContext, message: string): string {
  return `${START}${JSON.stringify(context)}${END}${message}`
}

export function readBotTurnPrompt(
  text: string
): { context: BotTurnContext; message: string } | null {
  if (!text.startsWith(START)) {
    return null
  }
  const end = text.indexOf(END, START.length)
  if (end === -1 || end > 200_000) {
    return null
  }
  try {
    const context = contextSchema.parse(JSON.parse(text.slice(START.length, end)))
    return { context, message: text.slice(end + END.length) }
  } catch {
    return null
  }
}
