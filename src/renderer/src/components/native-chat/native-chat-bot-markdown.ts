import {
  nativeChatBotByName,
  nativeChatBotHref,
  type NativeChatBotCatalogue
} from './native-chat-bot-catalogue'

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
  const split = (value: string): MarkdownNode[] => {
    if (!catalogue.pattern) {
      return [{ type: 'text', value }]
    }
    const nodes: MarkdownNode[] = []
    let from = 0
    for (const match of value.matchAll(catalogue.pattern)) {
      const bot = nativeChatBotByName(catalogue, match[1])
      if (!bot) {
        continue
      }
      const at = match.index
      if (at > from) {
        nodes.push({ type: 'text', value: value.slice(from, at) })
      }
      nodes.push({
        type: 'link',
        url: nativeChatBotHref(bot.id),
        children: [{ type: 'text', value: match[0] }]
      })
      from = at + match[0].length
    }
    if (from < value.length) {
      nodes.push({ type: 'text', value: value.slice(from) })
    }
    return nodes
  }
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
