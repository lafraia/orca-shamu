import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BotCommunication } from '../../../../shared/bot-communications'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { useStructuredAgentSessionRead } from './use-structured-agent-session-read'
import { botCommunicationReplies } from './bot-communication-replies'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { createNativeBotCommunicationProjection } from './native-bot-communications'

export type BotCommunicationPeerSnapshot = ReturnType<typeof botCommunicationReplies>

export function BotCommunicationPeer({
  sessionId,
  target,
  entries,
  selected,
  onSnapshot
}: {
  sessionId: string
  target: RuntimeClientTarget
  entries: readonly BotCommunication[]
  selected: BotCommunication
  onSnapshot: (sessionId: string, value: BotCommunicationPeerSnapshot) => void
}): React.JSX.Element | null {
  const read = useStructuredAgentSessionRead({
    sessionId,
    target,
    isVisible: true,
    isViewed: false
  })
  const { state, loadingOlder, loadOlder } = read
  const bots = useProjectChannels((store) => store.snapshot.channels)
  const project = useMemo(() => createNativeBotCommunicationProjection(), [])
  const snapshot = useMemo(
    () =>
      botCommunicationReplies(sessionId, entries, state, {
        environmentId: selected.environmentId,
        bots,
        project
      }),
    [sessionId, entries, state, selected.environmentId, bots, project]
  )
  const paged = useRef(0)
  const queued = state.queuedMessages?.some(
    (message) => message.messageId === selected.recipient.operationId
  )
  useEffect(() => {
    onSnapshot(sessionId, snapshot)
  }, [onSnapshot, sessionId, snapshot])
  useEffect(() => {
    if (
      selected.recipient.sessionId !== sessionId ||
      selected.state !== 'recorded' ||
      snapshot.found.has(selected.id) ||
      queued ||
      state.status !== 'ready' ||
      !state.hasOlder ||
      loadingOlder ||
      paged.current >= 3
    ) {
      return
    }
    paged.current += 1
    void loadOlder()
  }, [
    selected,
    sessionId,
    snapshot.found,
    queued,
    state.status,
    state.hasOlder,
    loadingOlder,
    loadOlder
  ])
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-chat-warning">
        {translate(
          'shamu.communication.readFailed',
          'Could not read replies. Open the original chat to inspect its history.'
        )}
      </p>
    )
  }
  return state.hasOlder ? (
    <Button variant="ghost" size="sm" disabled={loadingOlder} onClick={() => void loadOlder()}>
      {translate('shamu.communication.earlierReplies', 'Load earlier replies')}
    </Button>
  ) : null
}
