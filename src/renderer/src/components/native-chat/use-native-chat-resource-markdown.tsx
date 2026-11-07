import { useContext, useMemo } from 'react'
import type {
  CommentMarkdownExtension,
  CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { createCompactCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'
import { translate } from '@/i18n/i18n'
import { readNativeChatResourceHref } from '../../../../shared/native-chat/native-chat-resource-reference'
import { useShamuClient } from '../shamu/shamu-client-state'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import { nativeChatResourceIcon } from './native-chat-resource-reference'
import { NativeChatPromptPill } from './NativeChatPromptPill'
import { openNativeChatResource } from './open-native-chat-resource'

export function useNativeChatResourceMarkdown(
  base: CommentMarkdownExtension,
  onLinkClick?: CommentMarkdownLinkClickHandler
): CommentMarkdownExtension {
  const enabled = useShamuClient((state) => state.enabled)
  const communication = useContext(BotCommunicationContext)
  const close = communication?.close
  const fallback = useMemo(
    () => createCompactCommentMarkdownComponents(onLinkClick).a,
    [onLinkClick]
  )
  return useMemo(() => {
    if (!enabled) {
      return base
    }
    const Anchor = base.components.a ?? fallback
    return {
      ...base,
      components: {
        ...base.components,
        a: (props) => {
          const reference = readNativeChatResourceHref(props.href)
          if (!reference) {
            return typeof Anchor === 'function' ? (
              <Anchor {...props} />
            ) : (
              <a href={props.href}>{props.children}</a>
            )
          }
          return (
            <NativeChatPromptPill
              variant="inlineReference"
              icon={nativeChatResourceIcon(reference.kind)}
              label={reference.label}
              selected={false}
              title={reference.description}
              ariaLabel={translate('shamu.mentions.openReference', 'Open {{kind}}: {{name}}', {
                kind: reference.kind,
                name: reference.label
              })}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (openNativeChatResource(reference)) {
                  close?.()
                }
              }}
            />
          )
        }
      }
    }
  }, [base, enabled, fallback, close])
}
