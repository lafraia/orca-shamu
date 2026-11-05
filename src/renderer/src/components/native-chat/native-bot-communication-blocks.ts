import type { NativeChatBlock } from '../../../../shared/native-chat/native-chat-types'

export function nativeBotCommunicationBlocks(
  blocks: readonly NativeChatBlock[]
): NativeChatBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'text') {
      return block
    }
    const banner = block.text.match(
      /^──── From: [^\n]+ ────\nSubject: ([^\n]*)\n([\s\S]*)\n\[Reply: [^\n]+\]\n─{60}$/
    )
    return banner ? { ...block, text: [banner[1], banner[2]].filter(Boolean).join('\n\n') } : block
  })
}
