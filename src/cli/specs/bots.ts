import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

export const BOT_COMMAND_SPECS: CommandSpec[] = [
  'list',
  'send',
  'result',
  'create',
  'organize',
  'mention',
  'context',
  'routines',
  'vault'
].map((command) => ({
  path: ['bots', command],
  summary: `Orca Shamu bot ${command}`,
  usage:
    command === 'send'
      ? 'orca bots send --profile-dir <directory> --bot <name-or-id> --request-id <uuid> (--text <prompt>|--text-file <path>) [--sender <label>] [--json]'
      : command === 'result'
        ? 'orca bots result --profile-dir <directory> --request-id <uuid> [--json]'
        : `orca bots ${command} --profile-dir <Shamu-user-data-directory> [--input-file <request.json>|--input <json>] [--json]`,
  allowedFlags: [
    ...LOCAL_COMMAND_FLAGS,
    'profile-dir',
    'input-file',
    'input',
    ...(command === 'send'
      ? ['bot', 'request-id', 'text', 'text-file', 'sender']
      : command === 'result'
        ? ['request-id']
        : [])
  ],
  notes: [
    'Runs only against the selected local Shamu profile. Never copies pairing credentials.',
    'send accepts external prompts in the bot permanent chat; result reads only that request response. Keep the same UUID when retrying. Sender labels are display metadata, not verified identities.',
    'Use BOT_TOOLS.md in the bot folder for the command schemas. Bot management mutations require actorId and the user sourceItemId; external send requests use their own stable UUID.',
    'Reuse creation and run request identifiers after an interrupted call. Native run IDs contain 13 epoch millisecond digits, a hyphen, and 32 lowercase UUID hex digits.'
  ],
  examples: [
    `orca bots ${command} --profile-dir "/path/to/Orca Shamu" --input-file request.json --json`
  ]
}))
