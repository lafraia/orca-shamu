import { closeHistory } from '@tiptap/pm/history'
import { promptTextPosition } from './native-chat-prompt-document'
import type { BotMention } from '../../../../shared/bot-mentions'
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
  type Editor
} from '@tiptap/react'
import { Bot } from 'lucide-react'
import { NativeChatPromptPill } from './NativeChatPromptPill'
import { BOT_REFERENCE_NODE } from './native-chat-bot-mentions'

function BotReferencePill({ node, selected }: NodeViewProps): React.JSX.Element {
  return (
    <NodeViewWrapper
      as="span"
      className="inline"
      contentEditable={false}
      data-native-chat-bot-reference={node.attrs.botId}
    >
      <NativeChatPromptPill icon={Bot} label={String(node.attrs.label)} selected={selected} />
    </NodeViewWrapper>
  )
}

export const NativeChatBotReference = Node.create({
  name: BOT_REFERENCE_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ botId: { default: '' }, label: { default: '' }, token: { default: '' } }),
  addNodeView: () => ReactNodeViewRenderer(BotReferencePill),
  renderText: ({ node }) => String(node.attrs.token),
  renderHTML: ({ node }) => [
    'span',
    { 'data-native-chat-bot-reference': node.attrs.botId },
    String(node.attrs.token)
  ]
})

export function insertBotReference(
  editor: Editor,
  from: number,
  to: number,
  bot: BotMention
): void {
  const { doc } = editor.state
  const range = { from: promptTextPosition(doc, from), to: promptTextPosition(doc, to) }
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor
    .chain()
    .insertContentAt(range, [
      {
        type: NativeChatBotReference.name,
        attrs: { botId: bot.id, label: bot.name, token: `@${bot.name}` }
      },
      { type: 'text', text: ' ' }
    ])
    .run()
  editor.view.dispatch(closeHistory(editor.state.tr))
}
