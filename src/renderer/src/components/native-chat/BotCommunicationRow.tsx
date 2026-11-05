import { createContext, useContext } from 'react'
import { ChevronRight, MessagesSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { BotAvatar } from '../project-channels/BotAvatar'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import type { BotCommunicationRow as Row } from './native-chat-bot-communication-slots'
import { StatusDot } from './NativeChatSubagentRun'

export const BotCommunicationRowsContext = createContext<ReadonlyMap<string, Row>>(new Map())

export function BotCommunicationNotice(): React.JSX.Element | null {
  const communication = useContext(BotCommunicationContext)
  if (!communication?.error && !communication?.incomplete) {
    return null
  }
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 text-sm text-chat-warning"
    >
      <span>
        {communication.error ??
          translate(
            'shamu.communication.incomplete',
            'Some communication records are unavailable.'
          )}
      </span>
      <Button variant="ghost" size="sm" onClick={communication.retry}>
        {translate('shamu.communication.retry', 'Retry')}
      </Button>
    </div>
  )
}

export function BotCommunicationRow({ row }: { row: Row }): React.JSX.Element {
  const context = useContext(BotCommunicationContext)
  const peer = row.direction === 'incoming' ? row.entry.source : row.entry.recipient
  const identity = useProjectChannels(
    (state) => state.snapshot.channels.find((bot) => bot.id === peer.botId)?.identity
  )
  const status =
    row.state === 'working'
      ? 'working'
      : row.state === 'refused'
        ? 'failed'
        : row.state === 'replied'
          ? 'completed'
          : 'idle'
  const label =
    row.direction === 'outgoing' && row.entry.actor === 'bot'
      ? translate('shamu.communication.sent', 'Messaged {{name}}', { name: peer.name })
      : row.direction === 'outgoing' && row.entry.actor === 'user'
        ? translate('shamu.communication.notified', 'Notified {{name}}', { name: peer.name })
        : translate('shamu.communication.with', 'Communication with {{name}}', { name: peer.name })
  const states = {
    sending: translate('shamu.communication.sending', 'Sending'),
    sent: translate('shamu.communication.delivered', 'Sent'),
    working: translate('shamu.communication.working', 'Working'),
    replied: translate('shamu.communication.replied', 'Replied'),
    queued: translate('shamu.communication.queued', 'Queued'),
    refused: translate('shamu.communication.refused', 'Not delivered'),
    unconfirmed: translate('shamu.communication.unconfirmed', 'Check delivery')
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => context?.open(row.entry)}
      data-bot-communication={row.entry.id}
      className="group/bot-communication flex min-h-7 w-full items-center gap-2 rounded-md py-1 text-left text-sm text-chat-foreground-faint hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {peer.botId ? (
        <BotAvatar id={peer.botId} identity={identity} className="size-5 rounded-md" />
      ) : (
        <MessagesSquare aria-hidden className="size-4 shrink-0" />
      )}
      <StatusDot state={status} pulsing={row.state === 'working'} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs">{states[row.state]}</span>
      <ChevronRight aria-hidden className="size-3.5 shrink-0" />
    </button>
  )
}
