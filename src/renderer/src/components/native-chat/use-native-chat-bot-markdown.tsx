import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import { useContext, useMemo } from 'react'
import { Bot } from 'lucide-react'
import type {
  CommentMarkdownExtension,
  CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { createCompactCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'
import { translate } from '@/i18n/i18n'
import { nativeChatBotId } from './native-chat-bot-catalogue'
import { useNativeChatBotCatalogue } from './use-native-chat-bot-catalogue'
import { openNativeChatBot } from './open-native-chat-bot'
import { remarkNativeChatBotMentions } from './native-chat-bot-markdown'
import { NativeChatPromptPill } from './NativeChatPromptPill'

export function useNativeChatBotMarkdown(
  base: CommentMarkdownExtension,
  onLinkClick?: CommentMarkdownLinkClickHandler
): CommentMarkdownExtension {
  const communication = useContext(BotCommunicationContext)
  const closeCommunication = communication?.close
  const catalogue = useNativeChatBotCatalogue()
  const fallbackAnchor = useMemo(
    () => createCompactCommentMarkdownComponents(onLinkClick).a,
    [onLinkClick]
  )
  return useMemo<CommentMarkdownExtension>(() => {
    if (!catalogue.byId.size) {
      return base
    }
    const Anchor = base.components.a ?? fallbackAnchor
    return {
      ...base,
      remarkPlugins: [...base.remarkPlugins, [remarkNativeChatBotMentions, catalogue]],
      components: {
        ...base.components,
        a: (props) => {
          const id = nativeChatBotId(props.href)
          const bot = id ? catalogue.byId.get(id) : undefined
          if (!bot) {
            return typeof Anchor === 'function' ? (
              <Anchor {...props} />
            ) : (
              <a href={props.href}>{props.children}</a>
            )
          }
          return (
            <NativeChatPromptPill
              variant="inlineReference"
              icon={Bot}
              label={bot.name}
              selected={false}
              ariaLabel={translate('shamu.mentions.openNamedBot', 'Open bot chat: {{name}}', {
                name: bot.name
              })}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openNativeChatBot(bot.id, closeCommunication)
              }}
            />
          )
        }
      }
    }
  }, [base, catalogue, fallbackAnchor, closeCommunication])
}
