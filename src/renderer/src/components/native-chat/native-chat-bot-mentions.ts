import type { NativeChatComposerInput } from './native-chat-composer-input'
import type { JSONContent } from '@tiptap/react'
import type { BotMention } from '../../../../shared/bot-mentions'
import { promptLeafString } from './native-chat-prompt-document-text'

export const BOT_REFERENCE_NODE = 'nativeChatBotReference'

/** Only explicitly selected pills from the exact submitted document dispatch attention. */
export function selectedNativeChatBots(text: string, document?: JSONContent): BotMention[] {
  if (!document) {
    return []
  }
  const bots = new Map<string, BotMention>()
  const render = (node: JSONContent): string => {
    if (node.type === BOT_REFERENCE_NODE) {
      const { botId, label, token } = node.attrs ?? {}
      if (typeof botId === 'string' && typeof label === 'string' && token === `@${label}`) {
        bots.set(botId, { id: botId, name: label })
      }
    }
    return node.content
      ? node.content.map(render).join(node.type === 'doc' ? '\n' : '')
      : promptLeafString(node.type, node.attrs, node.text)
  }
  return render(document) === text ? [...bots.values()] : []
}

export function completeNativeChatBotMention(
  input: NativeChatComposerInput | null,
  bot: BotMention
): boolean {
  if (!input?.insertBotReference || input.disabled) {
    return false
  }
  const at = input.selectionStart ?? input.value.length
  const match = input.value.slice(0, at).match(/(?:^|\s)@(\S*)$/)
  if (!match) {
    return false
  }
  input.insertBotReference(at - match[1].length - 1, at, bot)
  input.focus()
  return true
}
