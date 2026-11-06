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
    const prompt = getOptionalStringFlag(flags, 'text')
    const promptFile = getOptionalStringFlag(flags, 'text-file')
    const direct =
      prompt !== undefined ||
      promptFile !== undefined ||
      flags.has('bot') ||
      flags.has('request-id') ||
      flags.has('sender')
    if ((text && direct) || (prompt && promptFile)) {
      throw new Error('Choose one request input or one prompt text source.')
    }
    if (promptFile && (await stat(promptFile)).size > 80_000) {
      throw new Error('Prompt text files must be smaller than 80 KB.')
    }
    const payload: unknown = text
      ? JSON.parse(text)
      : action === 'list'
        ? { action: 'list' }
        : action === 'send'
          ? {
              action,
              bot: getRequiredStringFlag(flags, 'bot'),
              requestId: getRequiredStringFlag(flags, 'request-id'),
              text: promptFile
                ? await readFile(promptFile, 'utf8')
                : getRequiredStringFlag(flags, 'text'),
              sender: getOptionalStringFlag(flags, 'sender')
            }
          : action === 'result'
            ? { action, requestId: getRequiredStringFlag(flags, 'request-id') }
            : null
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
  ['list', 'send', 'result', 'create', 'organize', 'mention', 'context', 'routines', 'vault'].map(
    (action) => [`bots ${action}`, commandHandler(action)]
  )
)
