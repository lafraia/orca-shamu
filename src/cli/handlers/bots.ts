import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { botCommandSchema, type BotCommand } from '../../shared/bot-commands'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClient } from '../runtime-client'

function commandHandler(action: string): CommandHandler {
  return async ({ flags, json }) => {
    const profile = resolve(getRequiredStringFlag(flags, 'profile-dir'))
    const file = getOptionalStringFlag(flags, 'input-file')
    const inline = getOptionalStringFlag(flags, 'input')
    if (file && inline) {
      throw new Error('Use either --input-file or --input.')
    }
    if (file && (await stat(file)).size > 1024 * 1024) {
      throw new Error('Bot requests must be smaller than 1 MB.')
    }
    const text = file ? await readFile(file, 'utf8') : inline
    const payload: unknown = text ? JSON.parse(text) : action === 'list' ? { action: 'list' } : null
    const command: BotCommand = botCommandSchema.parse(payload)
    if (
      action === 'routines'
        ? !command.action.startsWith('routine.')
        : action === 'vault'
          ? !command.action.startsWith('vault.')
          : command.action !== action
    ) {
      throw new Error('The request action must match the bots command.')
    }
    const client = new RuntimeClient(profile, 60_000, null, null)
    const response = await client.call('shamu.bots', command)
    printResult(response, json, (value) => JSON.stringify(value, null, 2))
  }
}
export const BOT_HANDLERS: Record<string, CommandHandler> = Object.fromEntries(
  ['list', 'create', 'organize', 'mention', 'context', 'routines', 'vault'].map((action) => [
    `bots ${action}`,
    commandHandler(action)
  ])
)
