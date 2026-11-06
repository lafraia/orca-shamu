import type { BotMention } from '../../../../shared/bot-mentions'
import type { ProjectChannel } from '../../../../shared/project-channels'
export {
  botReferenceHref as nativeChatBotHref,
  botReferenceId as nativeChatBotId
} from '../../../../shared/bot-reference'

export type NativeChatBotCatalogue = {
  byId: ReadonlyMap<string, BotMention>
  byName: ReadonlyMap<string, BotMention>
  pattern: RegExp | null
  plainPattern: RegExp | null
}
const keyFor = (name: string): string => name.toLocaleLowerCase()
export function createNativeChatBotCatalogue(bots: readonly BotMention[]): NativeChatBotCatalogue {
  const byName = new Map<string, BotMention>()
  const ambiguous = new Set<string>()
  for (const bot of bots) {
    const key = keyFor(bot.name)
    if (byName.has(key)) {
      ambiguous.add(key)
    }
    byName.set(key, bot)
  }
  ambiguous.forEach((key) => byName.delete(key))
  const names = [...new Set(bots.map((bot) => bot.name))].toSorted((a, b) => b.length - a.length)
  const alternatives = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return {
    byId: new Map(bots.map((bot) => [bot.id, bot])),
    byName,
    pattern: names.length
      ? new RegExp(String.raw`(?<![\p{L}\p{N}_./\\@-])@(${alternatives})(?![\p{L}\p{N}_-])`, 'giu')
      : null,
    plainPattern: names.length
      ? new RegExp(
          String.raw`(?<![\p{L}\p{N}_./\\@-])@?(${alternatives})(?![\p{L}\p{N}_/\\@-]|\.[\p{L}\p{N}])`,
          'giu'
        )
      : null
  }
}
export const EMPTY_BOT_CATALOGUE = createNativeChatBotCatalogue([])
let previousChannels: readonly ProjectChannel[] | null = null
let previousSignature = ''
let previousCatalogue = EMPTY_BOT_CATALOGUE
export function nativeChatBotCatalogue(
  channels: readonly ProjectChannel[]
): NativeChatBotCatalogue {
  if (channels === previousChannels) {
    return previousCatalogue
  }
  const bots = channels
    .filter((bot) => bot.home || (bot.members.length === 0 && bot.messages.length === 0))
    .map(({ id, name }) => ({ id, name }))
  const signature = JSON.stringify(bots)
  previousChannels = channels
  if (signature !== previousSignature) {
    previousSignature = signature
    previousCatalogue = createNativeChatBotCatalogue(bots)
  }
  return previousCatalogue
}
export const nativeChatBotByName = (
  catalogue: NativeChatBotCatalogue,
  name: string
): BotMention | undefined => catalogue.byName.get(keyFor(name))
