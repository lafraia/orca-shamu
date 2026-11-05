import { z } from 'zod'
import type { ProjectChannel } from './project-channels'

export const botSectionNameSchema = z.string().trim().max(80)

export function botSectionNames(
  channels: readonly ProjectChannel[],
  preferred: readonly string[] = []
): string[] {
  const names = new Set(
    [...channels.filter((bot) => !bot.pinned), ...channels.filter((bot) => bot.pinned)].map(
      (bot) => bot.section ?? ''
    )
  )
  return [...new Set([...preferred.filter((name) => names.has(name)), ...names])]
}
