import { useContext } from 'react'
import { BotReferenceText } from './BotReferenceText'
import { useNativeChatBotCatalogue } from '../native-chat/use-native-chat-bot-catalogue'
import { BotCommunicationContext } from './bot-communication-context'
import { translate } from '@/i18n/i18n'
import type { BotTurnContext } from '../../../../shared/bot-turn-context'
import { NativeChatDetailsDisclosure } from '../native-chat/NativeChatTranscriptChrome'

export function BotMemoryRecall({
  context
}: {
  context: BotTurnContext
}): React.JSX.Element | null {
  const catalogue = useNativeChatBotCatalogue()
  const communication = useContext(BotCommunicationContext)
  if (!context.entries.length) {
    return null
  }
  return (
    <NativeChatDetailsDisclosure
      summary={translate('shamu.memory.recalled', 'Recalled memory: {{count}}', {
        count: context.entries.length
      })}
    >
      <div className="space-y-3 text-sm">
        {context.entries.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <p className="font-medium">{entry.key}</p>
            <p className="whitespace-pre-wrap">
              <BotReferenceText
                text={entry.text}
                catalogue={catalogue}
                onOpen={communication?.close}
              />
            </p>
            <p className="text-xs text-muted-foreground">
              <BotReferenceText
                text={entry.sources.map((source) => source.label).join(', ')}
                catalogue={catalogue}
                onOpen={communication?.close}
              />
            </p>
          </div>
        ))}
      </div>
    </NativeChatDetailsDisclosure>
  )
}
