import { botCommandSchema } from '../../../../shared/bot-commands'
import { requireBotCommandService } from '../../../shamu-bots/bot-command-service'
import { defineMethod } from '../core'

export const SHAMU_BOT_METHODS = [
  defineMethod({
    name: 'shamu.bots',
    permission: 'workspace',
    params: botCommandSchema,
    handler: (params, ctx) => {
      if (ctx.caller?.kind !== 'local-cli') {
        throw new Error('Shamu bot commands require the local authenticated CLI.')
      }
      return requireBotCommandService().invoke(params, 'agent')
    }
  })
]
