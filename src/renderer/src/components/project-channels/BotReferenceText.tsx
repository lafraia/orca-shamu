import { Fragment } from 'react'
import { Bot } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { NativeChatBotCatalogue } from '../native-chat/native-chat-bot-catalogue'
import { splitNativeChatBotReferences } from '../native-chat/native-chat-bot-text-references'
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
      {splitNativeChatBotReferences(text, catalogue, true).map(({ start, text, bot }) =>
        bot ? (
          <NativeChatPromptPill
            key={start}
            icon={Bot}
            label={bot.name}
            selected={false}
            ariaLabel={translate('shamu.mentions.openNamedBot', 'Open bot chat: {{name}}', {
              name: bot.name
            })}
            onClick={
              disabled
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
