import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { BotCommunication } from '../../../../shared/bot-communications'
import type { BotIdentity } from '../../../../shared/bot-identity'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { BotAvatar } from '../project-channels/BotAvatar'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import { useStructuredAgentSessionRead } from './use-structured-agent-session-read'
import { botCommunicationReplies } from './bot-communication-replies'
import type {
  BotCommunicationRow,
  BotCommunicationRowState
} from './native-chat-bot-communication-slots'

export const BotCommunicationSummariesContext = createContext<
  ReadonlyMap<string, readonly BotCommunication[]>
>(new Map())

export function BotCommunicationSummary({
  entries
}: {
  entries: readonly BotCommunication[]
}): React.JSX.Element | null {
  const context = useContext(BotCommunicationContext)
  const peers = useMemo(() => {
    const groups = new Map<string, BotCommunication[]>()
    for (const entry of entries) {
      const group = groups.get(entry.recipient.sessionId) ?? []
      group.push(entry)
      groups.set(entry.recipient.sessionId, group)
    }
    return [...groups.values()]
  }, [entries])
  if (!context) {
    return null
  }
  return (
    <BotCommunicationSummaryLine>
      {peers.map((group) => (
        <LiveCommunicationPeer
          key={group[0].recipient.sessionId}
          entries={group}
          target={context.target}
          isVisible={context.isVisible ?? true}
          onOpen={context.open}
        />
      ))}
    </BotCommunicationSummaryLine>
  )
}

export function BotCommunicationSummaryLine({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  return (
    <div
      data-bot-communication-summary
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-chat-foreground-faint"
    >
      <span>{translate('shamu.communication.conversationsWith', 'Conversations with')}</span>
      {children}
    </div>
  )
}

function LiveCommunicationPeer({
  entries,
  target,
  isVisible,
  onOpen
}: {
  entries: readonly BotCommunication[]
  target: RuntimeClientTarget
  isVisible: boolean
  onOpen: (entry: BotCommunication) => void
}): React.JSX.Element {
  const { state } = useStructuredAgentSessionRead({
    sessionId: entries[0].recipient.sessionId,
    target,
    isVisible,
    isViewed: false
  })
  const snapshot = useMemo(
    () => botCommunicationReplies(entries[0].recipient.sessionId, entries, state),
    [entries, state]
  )
  const priorities: BotCommunicationRowState[] = [
    'waiting',
    'failed',
    'refused',
    'unconfirmed',
    'working',
    'queued',
    'sending',
    'sent',
    'replied'
  ]
  const entry =
    priorities.flatMap((status) =>
      entries.filter((row) => snapshot.states.get(row.id) === status)
    )[0] ?? entries[0]
  const identity = useProjectChannels(
    (store) => store.snapshot.channels.find((bot) => bot.id === entry.recipient.botId)?.identity
  )
  return (
    <BotCommunicationSummaryPeer
      row={{ entry, direction: 'outgoing', state: snapshot.states.get(entry.id) ?? 'sent' }}
      identity={identity}
      onOpen={() => onOpen(entry)}
    />
  )
}

export function BotCommunicationSummaryPeer({
  row,
  identity,
  onOpen
}: {
  row: BotCommunicationRow
  identity?: BotIdentity
  onOpen: () => void
}): React.JSX.Element {
  const peer = row.entry.recipient
  const labels: Record<BotCommunicationRowState, string> = {
    sending: translate('shamu.communication.sending', 'Sending'),
    sent: translate('shamu.communication.awaitingReply', 'Awaiting reply'),
    working: translate('shamu.communication.awaitingReply', 'Awaiting reply'),
    queued: translate('shamu.communication.queued', 'Queued'),
    replied: translate('shamu.communication.replied', 'Replied'),
    waiting: translate('shamu.communication.needsInput', 'Needs input'),
    refused: translate('shamu.communication.refused', 'Not delivered'),
    failed: translate('shamu.communication.failed', 'Reply not completed'),
    unconfirmed: translate('shamu.communication.checkReply', 'Check reply')
  }
  const warning = ['refused', 'failed', 'unconfirmed', 'waiting'].includes(row.state)
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={translate(
        'shamu.communication.openWith',
        'Open conversation with {{name}}: {{state}}',
        { name: peer.name, state: labels[row.state] }
      )}
      data-bot-communication={row.entry.id}
      data-communication-state={row.state}
      onClick={onOpen}
      className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 text-left hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BotAvatar
        id={peer.botId ?? peer.sessionId}
        identity={identity}
        activity={
          row.state === 'working' ? 'working' : row.state === 'waiting' ? 'waiting' : 'idle'
        }
        className="size-5"
      />
      <span className="min-w-0 truncate">{peer.name}</span>
      <span className={cn('shrink-0', warning && 'text-chat-warning')}>{labels[row.state]}</span>
      <ChevronRight aria-hidden className="size-3 shrink-0" />
    </button>
  )
}
