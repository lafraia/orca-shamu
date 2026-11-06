import type { HandlerGroup } from './handler-group-manifest'
export const BOT_HANDLER_GROUP: HandlerGroup = {
  name: 'bots',
  keys: [
    'bots list',
    'bots send',
    'bots result',
    'bots create',
    'bots organize',
    'bots mention',
    'bots context',
    'bots routines',
    'bots vault'
  ],
  load: async () => (await import('./handlers/bots.js')).BOT_HANDLERS
}
