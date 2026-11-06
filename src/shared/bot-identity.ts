import { z } from 'zod'

export const BOT_COLORS = ['blue', 'teal', 'green', 'amber', 'coral', 'pink', 'violet'] as const
export const BOT_SHAPES = ['circle', 'star', 'cloud', 'squircle'] as const
export const BOT_EXPRESSIONS = ['calm', 'curious', 'happy'] as const
export const botIdentitySchema = z.object({
  color: z.enum(BOT_COLORS),
  animated: z.boolean(),
  shape: z.enum(BOT_SHAPES).optional(),
  expression: z.enum(BOT_EXPRESSIONS).optional(),
  image: z
    .string()
    .max(180_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/)
    .optional()
})
export type BotIdentity = z.infer<typeof botIdentitySchema>

export function defaultBotIdentity(id: string): BotIdentity {
  const hash = [...id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0)
  return {
    color: BOT_COLORS[hash % BOT_COLORS.length],
    animated: true,
    shape: 'circle',
    expression: 'calm'
  }
}
