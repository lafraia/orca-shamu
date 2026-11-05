import { useMemo } from 'react'
import { Bot } from 'lucide-react'
import type {
  CommentMarkdownExtension,
  CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { createCompactCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { persistFloatingTerminalPanelOpen } from '../floating-terminal/floating-terminal-panel-view-state'
import { useShamuClient } from '../shamu/shamu-client-state'
import { openProjectChannel, useProjectChannels } from '../project-channels/project-channel-store'
import {
  EMPTY_BOT_CATALOGUE,
  nativeChatBotCatalogue,
  nativeChatBotId
} from './native-chat-bot-catalogue'
import { remarkNativeChatBotMentions } from './native-chat-bot-markdown'
import { NativeChatPromptPill } from './NativeChatPromptPill'

export function useNativeChatBotMarkdown(
  base: CommentMarkdownExtension,
  onLinkClick?: CommentMarkdownLinkClickHandler
): CommentMarkdownExtension {
  const enabled = useShamuClient((state) => state.enabled && state.environmentId !== null)
  const catalogue = useProjectChannels((state) =>
    enabled ? nativeChatBotCatalogue(state.snapshot.channels) : EMPTY_BOT_CATALOGUE
  )
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
              icon={Bot}
              label={bot.name}
              selected={false}
              ariaLabel={translate('shamu.mentions.openNamedBot', 'Open bot chat: {{name}}', {
                name: bot.name
              })}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (
                  !useProjectChannels.getState().snapshot.channels.some((row) => row.id === bot.id)
                ) {
                  return
                }
                const state = useAppStore.getState()
                if (state.floatingWorkspacePanelOpen) {
                  state.setFloatingWorkspacePanelOpen(false)
                  persistFloatingTerminalPanelOpen(false)
                }
                openProjectChannel(bot.id)
              }}
            />
          )
        }
      }
    }
  }, [base, catalogue, fallbackAnchor])
}
