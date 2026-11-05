import type { BotMention } from '../../../../shared/bot-mentions'
import { nativeChatBotByName, type NativeChatBotCatalogue } from './native-chat-bot-catalogue'

export type BotTextReference = { start: number; text: string; bot?: BotMention }

function inAddress(text: string, from: number, to: number): boolean {
  let start = from
  let end = to
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--
  }
  while (end < text.length && !/\s/.test(text[end])) {
    end++
  }
  const token = text.slice(start, end)
  return token.includes('://') || /[^@\s]+@[^@\s]+\.[^@\s]+/.test(token)
}

export function splitNativeChatBotReferences(
  text: string,
  catalogue: NativeChatBotCatalogue,
  includePlainNames = false
): BotTextReference[] {
  const pattern = includePlainNames ? catalogue.plainPattern : catalogue.pattern
  if (!pattern) {
    return [{ start: 0, text }]
  }
  const parts: BotTextReference[] = []
  let from = 0
  for (const match of text.matchAll(pattern)) {
    const bot = nativeChatBotByName(catalogue, match[1])
    if (
      !bot ||
      (includePlainNames && inAddress(text, match.index, match.index + match[0].length))
    ) {
      continue
    }
    const start = match.index
    if (start > from) {
      parts.push({ start: from, text: text.slice(from, start) })
    }
    parts.push({ start, text: match[0], bot })
    from = start + match[0].length
  }
  if (from < text.length) {
    parts.push({ start: from, text: text.slice(from) })
  }
  return parts
}
