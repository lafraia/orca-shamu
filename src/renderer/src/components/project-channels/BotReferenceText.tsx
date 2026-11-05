import { Fragment } from 'react'
import { Bot } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { NativeChatBotCatalogue } from '../native-chat/native-chat-bot-catalogue'
import { splitBotMemoryReferences } from './bot-memory-references'
import { openNativeChatBot } from '../native-chat/open-native-chat-bot'
import { NativeChatPromptPill } from '../native-chat/NativeChatPromptPill'

export function BotReferenceText({
  text,
  catalogue,
  disabled = false,
  onOpen
}: {
  text: string
  catalogue: NativeChatBotCatalogue
  disabled?: boolean
  onOpen?: () => void
}): React.JSX.Element {
  return (
    <>
      {splitBotMemoryReferences(text, catalogue).map(({ start, text, bot, unavailableName }) =>
        bot || unavailableName !== undefined ? (
          <NativeChatPromptPill
            key={start}
            icon={Bot}
            label={
              bot?.name ?? unavailableName ?? translate('shamu.mentions.unknownBot', 'Unknown bot')
            }
            selected={false}
            ariaLabel={translate('shamu.mentions.openNamedBot', 'Open bot chat: {{name}}', {
              name: bot?.name ?? unavailableName
            })}
            title={
              bot
                ? undefined
                : translate('shamu.mentions.unavailableBot', 'This bot is unavailable.')
            }
            onClick={
              disabled || !bot
                ? undefined
                : (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openNativeChatBot(bot.id, onOpen)
                  }
            }
          />
        ) : (
          <Fragment key={start}>{text}</Fragment>
        )
      )}
    </>
  )
}
