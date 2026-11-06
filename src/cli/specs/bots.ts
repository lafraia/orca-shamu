import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

export const BOT_COMMAND_SPECS: CommandSpec[] = [
  'list',
  'create',
  'organize',
  'mention',
  'context',
  'routines',
  'vault'
].map((command) => ({
  path: ['bots', command],
  summary: `Orca Shamu bot ${command}`,
  usage: `orca bots ${command} --profile-dir <Shamu-user-data-directory> [--input-file <request.json>|--input <json>] [--json]`,
  allowedFlags: [...LOCAL_COMMAND_FLAGS, 'profile-dir', 'input-file', 'input'],
  notes: [
    'Runs only against the selected local Shamu profile. Never copies pairing credentials.',
    'Use BOT_TOOLS.md in the bot folder for the command schemas. Mutating agent commands require actorId and the user sourceItemId.',
    'Reuse creation and run request identifiers after an interrupted call. Native run IDs contain 13 epoch millisecond digits, a hyphen, and 32 lowercase UUID hex digits.'
  ],
  examples: [
    `orca bots ${command} --profile-dir "/path/to/Orca Shamu" --input-file request.json --json`
  ]
}))
