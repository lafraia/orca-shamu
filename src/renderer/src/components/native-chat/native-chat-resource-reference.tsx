import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps
} from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { CircleDot, Folder, FolderGit2 } from 'lucide-react'
import {
  nativeChatResourceReferenceSchema,
  nativeChatResourceToken,
  type NativeChatResourceReference
} from '../../../../shared/native-chat/native-chat-resource-reference'
import { NativeChatPromptPill } from './NativeChatPromptPill'
import { promptTextPosition } from './native-chat-prompt-document'

export const NATIVE_CHAT_RESOURCE_ICONS = {
  workspace: Folder,
  project: FolderGit2,
  issue: CircleDot
}
export const nativeChatResourceIcon = (kind: NativeChatResourceReference['kind']) =>
  NATIVE_CHAT_RESOURCE_ICONS[kind]
function ResourcePill({ node, selected }: NodeViewProps): React.JSX.Element {
  const parsed = nativeChatResourceReferenceSchema.safeParse(node.attrs.reference)
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="inline"
      data-native-chat-resource-reference={parsed.success ? parsed.data.kind : 'unknown'}
    >
      <NativeChatPromptPill
        icon={nativeChatResourceIcon(parsed.success ? parsed.data.kind : 'workspace')}
        label={parsed.success ? parsed.data.label : String(node.attrs.token)}
        selected={selected}
        title={parsed.success ? parsed.data.description : undefined}
      />
    </NodeViewWrapper>
  )
}
export const NativeChatResourceReferenceNode = Node.create({
  name: 'nativeChatResourceReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ reference: { default: null }, token: { default: '' } }),
  addNodeView: () => ReactNodeViewRenderer(ResourcePill),
  renderText: ({ node }) => String(node.attrs.token),
  renderHTML: ({ node }) => [
    'span',
    { 'data-native-chat-resource-reference': node.attrs.reference?.kind },
    String(node.attrs.token)
  ]
})
export function insertResourceReference(
  editor: Editor,
  from: number,
  to: number,
  reference: NativeChatResourceReference
): void {
  if (!editor.isEditable) {
    return
  }
  const range = {
    from: promptTextPosition(editor.state.doc, from),
    to: promptTextPosition(editor.state.doc, to)
  }
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor
    .chain()
    .insertContentAt(range, [
      {
        type: NativeChatResourceReferenceNode.name,
        attrs: { reference, token: nativeChatResourceToken(reference) }
      },
      { type: 'text', text: ' ' }
    ])
    .run()
  editor.view.dispatch(closeHistory(editor.state.tr))
}
