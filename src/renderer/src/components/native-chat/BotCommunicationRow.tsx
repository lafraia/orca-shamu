import { createContext, useContext } from 'react'
import { ArrowUpRight, MessagesSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { BotAvatar } from '../project-channels/BotAvatar'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import type { BotCommunicationRow as Row } from './native-chat-bot-communication-slots'
import { BotCliPromptCard } from './BotCliPromptCard'
import { NativeChatMessageDisclosureCard } from './NativeChatMessageDisclosureCard'
import { BotCommunicationMessagePreview } from './BotCommunicationMessagePreview'

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
  const label =
    row.direction === 'incoming' && peer.botId
      ? translate('shamu.communication.fromBot', 'Message from bot {{name}}', { name: peer.name })
      : row.direction === 'incoming' && row.entry.native
        ? translate('shamu.communication.fromWorkspace', 'Message from {{name}}', {
            name: peer.name
          })
        : row.direction === 'outgoing' && row.entry.actor === 'bot'
          ? translate('shamu.communication.sent', 'Messaged {{name}}', { name: peer.name })
          : row.direction === 'outgoing' && row.entry.actor === 'user'
            ? translate('shamu.communication.notified', 'Notified {{name}}', { name: peer.name })
            : translate('shamu.communication.with', 'Communication with {{name}}', {
                name: peer.name
              })
  const states = {
    sending: translate('shamu.communication.sending', 'Sending'),
    sent: translate('shamu.communication.delivered', 'Sent'),
    working: translate('shamu.communication.working', 'Working'),
    replied: translate('shamu.communication.replied', 'Replied'),
    queued: translate('shamu.communication.queued', 'Queued'),
    refused: translate('shamu.communication.refused', 'Not delivered'),
    unconfirmed: translate('shamu.communication.unconfirmed', 'Check delivery'),
    waiting: translate('shamu.communication.needsInput', 'Needs input'),
    failed: translate('shamu.communication.failed', 'Reply not completed')
  }
  if (row.entry.cli) {
    return (
      <BotCliPromptCard
        requestId={row.entry.referenceId}
        text={row.entry.cli.text}
        sender={row.entry.cli.sender}
        status={states[row.state]}
      />
    )
  }
  return (
    <NativeChatMessageDisclosureCard
      disclosureKey={`bot-communication:${row.direction}:${row.entry.id}`}
      expandLabel={label}
      heading={
        row.direction === 'incoming'
          ? translate('components.native-chat.agentMessage.messageFrom', 'Message from')
          : translate('shamu.communication.messageTo', 'Message to')
      }
      avatar={
        peer.botId ? (
          <BotAvatar
            id={peer.botId}
            identity={identity}
            activity={
              row.state === 'working' ? 'working' : row.state === 'waiting' ? 'waiting' : 'idle'
            }
            className="size-6"
          />
        ) : (
          <MessagesSquare aria-hidden className="size-6 shrink-0" />
        )
      }
      sender={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={translate(
            'shamu.communication.openWith',
            'Open conversation with {{name}}: {{state}}',
            { name: peer.name, state: states[row.state] }
          )}
          onClick={() => context?.open(row.entry)}
          data-bot-communication={row.entry.id}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate">{peer.name}</span>
          <ArrowUpRight aria-hidden className="size-3 shrink-0" />
          <span className="shrink-0 text-xs text-muted-foreground">{states[row.state]}</span>
        </button>
      }
      timestamp={row.entry.createdAt > 0 ? row.entry.createdAt : null}
    >
      <div className="scrollbar-sleek max-h-60 overflow-y-auto overscroll-contain">
        <BotCommunicationMessagePreview entry={row.entry} />
      </div>
      <Button variant="link" size="inline" onClick={() => context?.open(row.entry)}>
        {translate('shamu.communication.openFullConversation', 'View full conversation')}
        <ArrowUpRight aria-hidden className="size-3" />
      </Button>
    </NativeChatMessageDisclosureCard>
  )
}
