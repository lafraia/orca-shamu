import { splitNativeChatBotReferences } from './native-chat-bot-text-references'
import { nativeChatBotHref, type NativeChatBotCatalogue } from './native-chat-bot-catalogue'

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] }
const SKIP = new Set([
  'code',
  'inlineCode',
  'link',
  'linkReference',
  'html',
  'definition',
  'image',
  'imageReference'
])
export function remarkNativeChatBotMentions(
  catalogue: NativeChatBotCatalogue
): (tree: MarkdownNode) => void {
  const split = (value: string): MarkdownNode[] =>
    splitNativeChatBotReferences(value, catalogue).map(({ text, bot }) =>
      bot
        ? {
            type: 'link',
            url: nativeChatBotHref(bot.id),
            children: [{ type: 'text', value: text }]
          }
        : { type: 'text', value: text }
    )
  const visit = (node: MarkdownNode): void => {
    if (SKIP.has(node.type) || !node.children) {
      return
    }
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text' && child.value?.includes('@')) {
        return split(child.value)
      }
      visit(child)
      return [child]
    })
  }
  return visit
}
