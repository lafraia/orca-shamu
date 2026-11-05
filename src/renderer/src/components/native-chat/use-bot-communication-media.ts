import { useContext, useMemo } from 'react'
import type { BotCommunicationParticipant } from '../../../../shared/bot-communications'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { BotCommunicationContext } from '../project-channels/bot-communication-context'
import { NativeChatMarkdownImageOwnerContext } from './native-chat-markdown-image-owner'
import { useNativeChatImageRuntimeContext } from './native-chat-image-runtime-context'
import { useNativeChatFileLinkContext } from './use-native-chat-file-link-context'

export function useBotCommunicationMedia(author: BotCommunicationParticipant) {
  const inherited = useContext(NativeChatMarkdownImageOwnerContext)
  const communication = useContext(BotCommunicationContext)
  const bot = useProjectChannels((state) =>
    state.snapshot.channels.find((row) => row.id === author.botId)
  )
  const member = bot?.members.find(
    (row) => row.id === bot.home?.memberId && row.sessionId === author.sessionId
  )
  const runtimeContext = useNativeChatImageRuntimeContext(member?.tabId ?? '')
  const fileLinkContext = useNativeChatFileLinkContext(member?.tabId ?? '')
  return useMemo(() => {
    if (
      !bot?.home?.ready ||
      !member ||
      member.target.kind !== 'environment' ||
      communication?.target.kind !== 'environment' ||
      member.target.environmentId !== communication.target.environmentId
    ) {
      return inherited
    }
    if (
      runtimeContext?.target.kind === 'environment' &&
      runtimeContext.target.environmentId === member.target.environmentId &&
      fileLinkContext?.runtimeEnvironmentId === member.target.environmentId
    ) {
      return { sessionId: author.sessionId, isVisible: true, runtimeContext, fileLinkContext }
    }
    if (
      inherited?.sessionId === author.sessionId &&
      inherited.runtimeContext?.worktreePath &&
      inherited.fileLinkContext
    ) {
      return inherited
    }
    return {
      sessionId: author.sessionId,
      isVisible: true,
      runtimeContext: {
        target: member.target,
        worktreeId: member.worktreeId,
        worktreePath: bot.home.directory
      },
      fileLinkContext: {
        worktreeId: member.worktreeId,
        worktreePath: bot.home.directory,
        runtimeEnvironmentId: member.target.environmentId,
        sourceTabId: member.tabId
      }
    }
  }, [
    author.sessionId,
    bot,
    communication?.target,
    fileLinkContext,
    inherited,
    member,
    runtimeContext
  ])
}
