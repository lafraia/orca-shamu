import { useContext, useMemo } from 'react'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { createNativeBotCommunicationProjection } from './native-bot-communications'
import { createNativeChatBotCommunicationProjection } from './native-chat-bot-communication-slots'
import type { NativeChatRailOutlineEntry } from './native-chat-message-rail-items'
import type { NativeChatTranscriptSlot } from './native-chat-transcript-slots'
import type { NativeChatTurnRows } from './use-native-chat-turn-membership'

export function useNativeChatBotCommunication({
  slots,
  sessionId,
  turnRows,
  submissions,
  isWorking,
  actionablePromptIds,
  journalItems,
  railOutline
}: {
  slots: readonly NativeChatTranscriptSlot[]
  sessionId: string | null | undefined
  turnRows: NativeChatTurnRows
  submissions?: readonly AgentJournalSubmission[]
  isWorking: boolean
  actionablePromptIds?: readonly string[]
  journalItems?: readonly AgentJournalRenderItem[]
  railOutline?: readonly NativeChatRailOutlineEntry[] | null
}) {
  const communication = useContext(BotCommunicationContext)
  const bots = useProjectChannels((state) => state.snapshot.channels)
  const nativeProject = useMemo(() => createNativeBotCommunicationProjection(), [])
  const storedEntries = communication?.entries
  const environmentId =
    communication?.target.kind === 'environment' ? communication.target.environmentId : null
  const entries = useMemo(() => {
    if (!storedEntries || !environmentId) {
      return []
    }
    return [
      ...storedEntries,
      ...nativeProject(turnRows.messages, sessionId ?? '', environmentId, bots, submissions)
    ]
  }, [storedEntries, environmentId, sessionId, turnRows.messages, bots, submissions, nativeProject])
  const project = useMemo(() => createNativeChatBotCommunicationProjection(), [])
  const view = useMemo(
    () =>
      project(
        slots,
        entries,
        sessionId ?? '',
        turnRows,
        submissions ?? [],
        isWorking,
        actionablePromptIds,
        journalItems
      ),
    [
      project,
      slots,
      entries,
      sessionId,
      turnRows,
      submissions,
      isWorking,
      actionablePromptIds,
      journalItems
    ]
  )
  const railTurnRows = useMemo(() => {
    const keep = turnRows.messages.map((message) => !view.hiddenMessageIds.has(message.id))
    return {
      ...turnRows,
      messages: turnRows.messages.filter((_, index) => keep[index]),
      turnKeys: turnRows.turnKeys.filter((_, index) => keep[index])
    }
  }, [turnRows, view.hiddenMessageIds])
  const outline = useMemo(
    () => railOutline?.filter((row) => !view.hiddenPromptIds.has(row.id)),
    [railOutline, view.hiddenPromptIds]
  )
  return { ...view, railTurnRows, outline }
}
