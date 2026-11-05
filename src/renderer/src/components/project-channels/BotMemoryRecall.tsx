import { translate } from '@/i18n/i18n'
import type { BotTurnContext } from '../../../../shared/bot-turn-context'
import { NativeChatDetailsDisclosure } from '../native-chat/NativeChatTranscriptChrome'

export function BotMemoryRecall({
  context
}: {
  context: BotTurnContext
}): React.JSX.Element | null {
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
            <p className="whitespace-pre-wrap">{entry.text}</p>
            <p className="text-xs text-muted-foreground">
              {entry.sources.map((source) => source.label).join(', ')}
            </p>
          </div>
        ))}
      </div>
    </NativeChatDetailsDisclosure>
  )
}
