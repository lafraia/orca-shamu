import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { useStructuredAgentSession } from '../native-chat/use-structured-agent-session'
import { reserveStructuredAgentSessionSend } from '../native-chat/structured-agent-session-message-sender'
import { projectChannelPrompt, projectChannelRecipients } from '../../../../shared/project-channels'
import {
  changeProjectChannel,
  consumeProjectChannelDraft,
  restoreProjectChannelDraft,
  useProjectChannels
} from './project-channel-store'
import { availableProjectChannelMember } from './project-channel-candidates'

export type ProjectChannelController = Pick<
  ReturnType<typeof useStructuredAgentSession>,
  'status' | 'readCurrent' | 'isWorking' | 'sendOut' | 'prompts'
>
export type ProjectChannelControllers = Map<string, () => ProjectChannelController>

export async function sendProjectChannelMessage(
  channelId: string,
  text: string,
  controllers: ProjectChannelControllers
): Promise<void> {
  const channel = useProjectChannels
    .getState()
    .snapshot.channels.find((row) => row.id === channelId)
  if (!channel || !text.trim()) {
    return
  }
  const recipients = projectChannelRecipients(channel, text)
  if (recipients.length === 0) {
    throw new Error('Link an agent conversation to this bot before sending.')
  }
  for (const member of recipients) {
    const controller = controllers.get(member.id)?.()
    if (
      !availableProjectChannelMember(useAppStore.getState(), member) ||
      !member.historyImported ||
      !controller?.readCurrent ||
      controller.status !== 'ready'
    ) {
      throw new Error(`Open the original chat for @${member.handle} before sending.`)
    }
    if (controller.isWorking || controller.sendOut || controller.prompts.length > 0) {
      throw new Error(
        `@${member.handle} is busy or waiting for your answer. Finish that turn before sending.`
      )
    }
  }
  const reservations: {
    member: (typeof recipients)[number]
    send: NonNullable<ReturnType<typeof reserveStructuredAgentSessionSend>>
  }[] = []
  let draftLease: ReturnType<typeof consumeProjectChannelDraft> = null
  let persisted = false
  try {
    for (const member of recipients) {
      const send = reserveStructuredAgentSessionSend({
        sessionId: member.sessionId,
        text: projectChannelPrompt(channel, member, text),
        callerKeepsText: true
      })
      if (!send) {
        throw new Error(`A message to @${member.handle} is already being sent.`)
      }
      reservations.push({ member, send })
    }
    const id = createBrowserUuid()
    draftLease = consumeProjectChannelDraft(channelId, text)
    await changeProjectChannel(channelId, (current) => ({
      ...current,
      draft: '',
      messages: [
        ...current.messages,
        {
          id,
          role: 'user',
          text,
          createdAt: Date.now(),
          deliveries: Object.fromEntries(
            recipients.map((member) => [member.id, 'sending' as const])
          ),
          deliveryIds: Object.fromEntries(
            reservations.map(({ member, send }) => [member.id, send.clientMessageId])
          )
        }
      ]
    }))
    persisted = true
    for (const { member, send } of reservations) {
      const current = useProjectChannels
        .getState()
        .snapshot.channels.find((row) => row.id === channelId)
      const stillMember = current?.members.some(
        (row) => row.id === member.id && row.sessionId === member.sessionId
      )
      const canIssue = stillMember && availableProjectChannelMember(useAppStore.getState(), member)
      if (!canIssue) {
        send.release()
      }
      const issued = canIssue ? send.send(member.target) : null
      void (issued?.outcome ?? Promise.resolve('returned' as const))
        .then((outcome) =>
          changeProjectChannel(channelId, (current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.id === id &&
              message.deliveries?.[member.id] !== 'returned' &&
              message.deliveries?.[member.id] !== 'unconfirmed'
                ? {
                    ...message,
                    deliveries: {
                      ...message.deliveries,
                      [member.id]: outcome === 'dropped' ? 'returned' : outcome
                    }
                  }
                : message
            )
          }))
        )
        .catch(() => {})
    }
  } catch (error) {
    if (!persisted) {
      restoreProjectChannelDraft(channelId, text, draftLease)
    }
    reservations.forEach(({ send }) => send.release())
    throw error
  }
}
