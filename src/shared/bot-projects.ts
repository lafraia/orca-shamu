import { z } from 'zod'
import { normalizeExecutionHostId } from './execution-host'

export const botProjectRefSchema = z.object({
  environmentId: z.string().min(1).max(1024),
  executionHostId: z
    .string()
    .min(1)
    .max(1024)
    .refine((id) => normalizeExecutionHostId(id) === id),
  kind: z.enum(['repo', 'folder', 'group']),
  id: z.string().min(1).max(1024)
})

export const botProjectLinkSchema = botProjectRefSchema.extend({
  name: z.string().trim().min(1).max(200)
})

export type BotProjectRef = z.infer<typeof botProjectRefSchema>
export type BotProjectLink = z.infer<typeof botProjectLinkSchema>

export type BotProjectCatalogEntry = {
  ref: BotProjectRef
  name: string
  path: string | null
  projectGroupId: string | null
  parentGroupId?: string | null
}

export type BotProjectCatalog = { entries: BotProjectCatalogEntry[] }

export const botProjectsContextSchema = z.object({
  environmentId: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['repo', 'folder', 'group']),
      path: z.string().nullable(),
      executionHostId: z.string()
    })
  ),
  unavailable: z.array(z.object({ name: z.string(), reason: z.enum(['missing', 'other-server']) })),
  omitted: z.number().int().nonnegative()
})

export type BotProjectsContext = z.infer<typeof botProjectsContextSchema>

export function botProjectKey(ref: BotProjectRef): string {
  return JSON.stringify([ref.environmentId, ref.executionHostId, ref.kind, ref.id])
}
