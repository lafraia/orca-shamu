import { Fragment, useContext } from 'react'
import { Bot, MessagesSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { NativeChatBotCatalogue } from '../native-chat/native-chat-bot-catalogue'
import { splitBotMemoryReferences } from './bot-memory-references'
import { openNativeChatBot } from '../native-chat/open-native-chat-bot'
import { NativeChatPromptPill } from '../native-chat/NativeChatPromptPill'
import { BotCommunicationContext } from './bot-communication-context'

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
  const communication = useContext(BotCommunicationContext)
  return (
    <>
      {splitBotMemoryReferences(text, catalogue, communication?.entries).map(
        ({ start, text, bot, unavailableName, communication: exchange }) =>
          exchange ? (
            <NativeChatPromptPill
              key={start}
              variant="inlineReference"
              icon={MessagesSquare}
              label={translate('shamu.memory.messageFrom', 'Message from {{name}}', {
                name: exchange.source.name
              })}
              selected={false}
              ariaLabel={translate('shamu.memory.openSourceMessage', 'Open message from {{name}}', {
                name: exchange.source.name
              })}
              onClick={
                disabled
                  ? undefined
                  : (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      communication?.open(exchange)
                    }
              }
            />
          ) : bot || unavailableName !== undefined ? (
            <NativeChatPromptPill
              key={start}
              variant="inlineReference"
              icon={Bot}
              label={
                bot?.name ??
                unavailableName ??
                translate('shamu.mentions.unknownBot', 'Unknown bot')
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
