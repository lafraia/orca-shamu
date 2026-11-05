import { botReferenceId } from '../../../../shared/bot-reference'
import type { NativeChatBotCatalogue } from '../native-chat/native-chat-bot-catalogue'
import {
  nativeChatReferenceInAddress,
  splitNativeChatBotReferences,
  type BotTextReference
} from '../native-chat/native-chat-bot-text-references'

export type BotMemoryReference = BotTextReference & { unavailableName?: string }

const REFERENCES =
  /\[((?:\\.|[^\]\\])*)\]\((#orca-shamu-bot\/[^\s)]+)\)|(?<![\p{L}\p{N}_./\\@-])([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})(?![\p{L}\p{N}_/\\@-]|\.[\p{L}\p{N}])/giu

function legacyNameStart(text: string, idStart: number, idEnd: number, name: string): number {
  const annotation = text.slice(0, idStart).match(/\s*\((?:bot\s+)?$/i)
  if (!annotation || text[idEnd] !== ')') {
    return idStart
  }
  const nameEnd = idStart - annotation[0].length
  let start = nameEnd - name.length
  if (start < 0 || text.slice(start, nameEnd).toLocaleLowerCase() !== name.toLocaleLowerCase()) {
    return idStart
  }
  if (text[start - 1] === '@') {
    start--
  }
  return start === 0 || !/[\p{L}\p{N}_./\\@-]/u.test(text[start - 1]) ? start : idStart
}

export function splitBotMemoryReferences(
  text: string,
  catalogue: NativeChatBotCatalogue
): BotMemoryReference[] {
  const parts: BotMemoryReference[] = []
  let from = 0
  const appendPlain = (end: number) => {
    if (end <= from) {
      return
    }
    for (const part of splitNativeChatBotReferences(text.slice(from, end), catalogue, true)) {
      parts.push({ ...part, start: from + part.start })
    }
  }
  for (const match of text.matchAll(REFERENCES)) {
    let start = match.index
    let end = start + match[0].length
    const id = match[2] ? botReferenceId(match[2]) : match[3].toLowerCase()
    const bot = id ? catalogue.byId.get(id) : undefined
    if (!match[2]) {
      if (!bot || nativeChatReferenceInAddress(text, start, end)) {
        continue
      }
      const nameStart = legacyNameStart(text, start, end, bot.name)
      if (nameStart >= from && nameStart < start) {
        start = nameStart
        end++
      }
    }
    appendPlain(start)
    parts.push({
      start,
      text: text.slice(start, end),
      ...(bot
        ? { bot }
        : { unavailableName: match[1].replace(/\\([\\[\]])/g, '$1').replace(/^@/, '') })
    })
    from = end
  }
  appendPlain(text.length)
  return parts
}
