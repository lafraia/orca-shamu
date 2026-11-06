import { z } from 'zod'

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes('\0'))
const botId = text(1024).min(1)
export const vaultPassphraseSchema = text(1024).min(1)
export const vaultNewPassphraseSchema = vaultPassphraseSchema.min(15)
export const vaultEntryInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: text(120).trim().min(1).refine(isVaultLabel),
    username: text(320),
    website: text(2048).refine((value) => {
      if (!value) {
        return true
      }
      try {
        const url = new URL(value)
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      } catch {
        return false
      }
    }),
    secret: text(16_384).min(1).optional(),
    allowAgent: z.boolean(),
    environmentVariable: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
      .refine(
        (value) =>
          !/^(PATH|HOME|USERPROFILE|SYSTEMROOT|COMSPEC|PATHEXT|NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|SHELLOPTS|PYTHONPATH|PYTHONHOME|RUBYOPT|PERL5OPT|GIT_CONFIG.*|LD_.*|DYLD_.*)$/.test(
            value
          )
      )
  })
  .strict()

export const vaultEntrySchema = vaultEntryInputSchema
  .omit({ secret: true, id: true })
  .extend({
    id: z.uuid(),
    botId,
    sealId: z.uuid(),
    updatedAt: z.number().int().nonnegative()
  })
  .strict()
export type VaultEntryInput = z.infer<typeof vaultEntryInputSchema>
export type VaultEntry = z.infer<typeof vaultEntrySchema>

export const vaultAgentCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('vault.list'), actorId: botId }).strict(),
  z.object({ action: z.literal('vault.result'), actorId: botId, requestId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('vault.run'),
      actorId: botId,
      sourceItemId: text(1024).min(1),
      requestId: z.uuid(),
      entryId: z.uuid(),
      program: text(4096).min(1),
      args: z.array(text(2048)).max(32)
    })
    .strict()
    .refine((value) => JSON.stringify(value.args).length <= 8192)
])
export type VaultAgentCommand = z.infer<typeof vaultAgentCommandSchema>
export type VaultRunCommand = Extract<VaultAgentCommand, { action: 'vault.run' }>
export type VaultRun = {
  requestId: string
  botId: string
  entryId: string
  program: string
  args: string[]
  cwd: string
  state: 'pending' | 'running' | 'completed' | 'denied' | 'cancelled' | 'failed'
  expiresAt: number
  exitCode?: number | null
  timedOut?: boolean
}
export type VaultSnapshot = {
  state: 'missing' | 'locked' | 'unlocked' | 'unavailable'
  session: string | null
  revision: number
  entries: VaultEntry[]
  requests: VaultRun[]
}
export type VaultAccess = { botId: string; session: string; revision: number }
export type VaultChange = { unlocked: boolean; pendingBotIds: string[] }
export type ShamuVaultApi = {
  status: (botId: string) => Promise<VaultSnapshot>
  create: (botId: string, passphrase: string) => Promise<VaultSnapshot>
  unlock: (botId: string, passphrase: string) => Promise<VaultSnapshot>
  lock: () => Promise<void>
  save: (access: VaultAccess, input: VaultEntryInput) => Promise<VaultSnapshot>
  remove: (access: VaultAccess, id: string) => Promise<VaultSnapshot>
  copy: (access: VaultAccess, id: string, passphrase: string) => Promise<void>
  changePassphrase: (access: VaultAccess, current: string, next: string) => Promise<void>
  decide: (access: VaultAccess, requestId: string, approve: boolean) => Promise<void>
  onChanged: (listener: (change: VaultChange) => void) => () => void
}

export function describeVaultArgument(value: string | string[]): string {
  return JSON.stringify(value).replace(
    /[\u202a-\u202e\u2066-\u2069]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}

function isVaultLabel(value: string): boolean {
  return !Array.from(value).some((character) => {
    const point = character.codePointAt(0)!
    return (
      point < 32 ||
      (point >= 127 && point <= 159) ||
      (point >= 0x202a && point <= 0x202e) ||
      (point >= 0x2066 && point <= 0x2069)
    )
  })
}
