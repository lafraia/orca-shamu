import { memo, useEffect } from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { useStructuredAgentSession } from '../native-chat/use-structured-agent-session'
import { NativeChatApprovalCard } from '../native-chat/NativeChatApprovalCard'
import { NativeChatStructuredQuestionCard } from '../native-chat/NativeChatStructuredQuestionCard'
import { useStructuredPromptResponseHold } from '../native-chat/use-structured-prompt-response-hold'
import { chatApprovalFromJournal } from '../../../../shared/native-chat/input/native-chat-interactive-prompt'
import { agentSessionPromptQuestions } from '../../../../shared/agent-session/agent-session-question-answer'
import type {
  ProjectChannelMember,
  ProjectChannelMessage
} from '../../../../shared/project-channels'
import { changeProjectChannel } from './project-channel-store'
import {
  availableProjectChannelMember,
  openProjectChannelSource
} from './project-channel-candidates'
import { syncProjectChannelMessages } from './project-channel-transcript'
import type { ProjectChannelControllers } from './project-channel-send'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'

export const ProjectChannelAgent = memo(function ProjectChannelAgent({
  channelId,
  member,
  controllers
}: {
  channelId: string
  member: ProjectChannelMember
  controllers: ProjectChannelControllers
}): React.JSX.Element {
  useUiLanguageRevision()
  const available = useAppStore((state) => availableProjectChannelMember(state, member))
  const controller = useStructuredAgentSession({
    sessionId: member.sessionId,
    target: member.target,
    agent: member.agent,
    isVisible: available,
    transportEnabled: available,
    queueFollowUps: true
  })
  const readController = useLatestHandler(() => controller)
  useEffect(() => {
    controllers.set(member.id, readController)
    return () => {
      controllers.delete(member.id)
    }
  }, [controllers, member.id, readController])
  useEffect(() => {
    if (available && controller.readCurrent && controller.status === 'ready') {
      syncProjectChannelMessages(channelId, member.id, controller.messages, {
        items: controller.journalItems,
        submissions: controller.submissions,
        latestTurn: controller.latestTurn,
        epoch: controller.epoch ?? undefined
      })
    }
  }, [
    available,
    channelId,
    member.id,
    controller.readCurrent,
    controller.status,
    controller.messages,
    controller.journalItems,
    controller.submissions,
    controller.latestTurn,
    controller.epoch
  ])
  useEffect(() => {
    if (!controller.readCurrent || controller.status !== 'ready') {
      return
    }
    const reconcileDeliveries = (): void => {
      void changeProjectChannel(channelId, (channel) => {
        let changed = false
        const messages = channel.messages.map((message) => {
          const deliveryId = message.deliveryIds?.[member.id]
          const delivery = message.deliveries?.[member.id]
          if (!deliveryId || !delivery || delivery === 'returned') {
            return message
          }
          const submission = controller.submissions.find(
            (row) => row.clientMessageId === deliveryId
          )
          const next: NonNullable<ProjectChannelMessage['deliveries']>[string] = submission
            ? submission.dispatchState === 'rejected'
              ? 'returned'
              : submission.dispatchState === 'unknown'
                ? 'unconfirmed'
                : 'recorded'
            : delivery !== 'recorded' && Date.now() - message.createdAt > 35_000
              ? 'unconfirmed'
              : delivery
          if (next === delivery) {
            return message
          }
          changed = true
          return { ...message, deliveries: { ...message.deliveries, [member.id]: next } }
        })
        return changed ? { ...channel, messages } : channel
      }).catch(() => {})
    }
    reconcileDeliveries()
    // Reload can leave a persisted send without its in-memory sender.
    const deadline = setTimeout(reconcileDeliveries, 35_001)
    return () => clearTimeout(deadline)
  }, [channelId, member.id, controller.readCurrent, controller.status, controller.submissions])
  const held = useStructuredPromptResponseHold(controller.respond)
  const prompt = controller.prompts[0]
  const approval = prompt?.body.kind === 'approval' ? chatApprovalFromJournal(prompt.body) : null
  const cancel = (): void => {
    if (prompt) {
      void controller.cancel(undefined, {
        itemId: prompt.itemId,
        expectedRevision: prompt.revision
      })
    }
  }
  return (
    <div className="min-w-0" data-project-agent={member.handle}>
      <div className="flex items-center gap-2 px-4 py-1 text-xs text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-current" />
        <span className="truncate font-medium text-foreground">{member.name}</span>
        <span className="truncate">
          {!available
            ? translate('projectChannels.offline', 'Chat unavailable')
            : controller.status === 'loading' || !member.historyImported
              ? translate('projectChannels.connecting', 'Connecting…')
              : prompt
                ? translate('projectChannels.needsAnswer', 'Needs your answer')
                : controller.isWorking
                  ? translate('projectChannels.working', 'Working…')
                  : controller.status === 'error'
                    ? translate('projectChannels.connectionError', 'Could not read chat')
                    : translate('projectChannels.ready', 'Ready')}
        </span>
        {available && controller.isWorking ? (
          <Button variant="ghost" size="xs" onClick={() => void controller.stop()}>
            {translate('projectChannels.stop', 'Stop')}
          </Button>
        ) : null}
        {member.importHistory && controller.hasOlder ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={controller.loadingOlder}
            onClick={controller.loadOlder}
          >
            {translate('projectChannels.loadEarlier', 'Load earlier conversation')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          disabled={!available}
          onClick={() => openProjectChannelSource(member)}
          className="ml-auto"
        >
          {translate('projectChannels.openChat', 'Open chat')}
        </Button>
      </div>
      {prompt && approval ? (
        <NativeChatApprovalCard
          approval={approval}
          onChoose={(optionId) => void held.respond(prompt, { kind: 'option', optionId })}
          onCancel={cancel}
          isSubmitting={held.holds(prompt)}
        />
      ) : null}
      {prompt?.body.kind === 'question' ? (
        <NativeChatStructuredQuestionCard
          questions={agentSessionPromptQuestions(prompt.body)}
          onAnswer={(answer) => void held.respond(prompt, answer)}
          onCancel={cancel}
          isSubmitting={held.holds(prompt)}
        />
      ) : null}
    </div>
  )
})
