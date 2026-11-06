import type { Editor } from '@tiptap/react'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { NativeChatAgentReference, insertAgentReferences } from './native-chat-agent-reference'
import { NativeChatBotReference, insertBotReference } from './native-chat-bot-reference'
import {
  NativeChatResourceReferenceNode,
  insertResourceReference
} from './native-chat-resource-reference'

export const nativeChatReferenceExtensions = [
  NativeChatAgentReference,
  NativeChatBotReference,
  NativeChatResourceReferenceNode
]
export function nativeChatReferenceInsertion(
  editor: Editor
): Pick<
  NativeChatComposerInput,
  'insertAgentReferences' | 'insertBotReference' | 'insertResourceReference'
> {
  return {
    insertAgentReferences: (references) => insertAgentReferences(editor, references),
    insertBotReference: (from, to, bot) => insertBotReference(editor, from, to, bot),
    insertResourceReference: (from, to, reference) =>
      insertResourceReference(editor, from, to, reference)
  }
}
