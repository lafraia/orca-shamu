import type { JSONContent } from '@tiptap/react'
import { toast } from 'sonner'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { BotMentionRequest } from '../../../../shared/bot-mentions'
import {
  openProjectChannel,
  reloadProjectChannels,
  useProjectChannels
} from '../project-channels/project-channel-store'
import { selectedNativeChatBots } from './native-chat-bot-mentions'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

export function prepareNativeChatBotNotification(
  transport: NativeChatStructuredComposerTransport,
  text: string,
  document?: JSONContent
): (() => Promise<void>) | null {
  const sourceBot = useProjectChannels
    .getState()
    .snapshot.channels.find((bot) =>
      bot.members.some(
        (member) =>
          member.id === bot.home?.memberId &&
          member.sessionId === transport.sessionId &&
          member.target.kind === 'environment' &&
          member.target.environmentId === transport.runtimeEnvironmentId
      )
    )
  if (sourceBot) {
    return null
  }
  const bots = selectedNativeChatBots(text, document)
  if (bots.length === 0) {
    return null
  }
  const state = useAppStore.getState()
  const tab = Object.values(state.unifiedTabsByWorktree)
    .flat()
    .find((row) => row.entityId === transport.sessionId)
  const request: BotMentionRequest = {
    id: createBrowserUuid(),
    botIds: bots.map((bot) => bot.id),
    text,
    source: {
      sessionId: transport.sessionId,
      environmentId: transport.runtimeEnvironmentId ?? '',
      ...(transport.worktreeId ? { worktreeId: transport.worktreeId } : {}),
      label:
        tab?.customLabel ||
        tab?.label ||
        translate('shamu.mentions.sourceConversation', 'Conversation')
    }
  }
  const notify = async (): Promise<void> => {
    try {
      const api = window.api.projectChannels
      if (!api || !request.source.environmentId) {
        throw new Error(
          translate(
            'shamu.mentions.unavailable',
            'Open this conversation in Shamu to notify a bot.'
          )
        )
      }
      const receipts = await api.notifyBots(request)
      const delivered = receipts.filter((receipt) => receipt.state === 'recorded')
      const failed = receipts.filter(
        (receipt) => receipt.state !== 'recorded' && receipt.state !== 'self'
      )
      const first = receipts[0]
      const action = first
        ? {
            label: translate('shamu.mentions.openBot', 'Open bot chat'),
            onClick: () => {
              void reloadProjectChannels().then(() => openProjectChannel(first.botId))
            }
          }
        : undefined
      if (failed.length > 0) {
        toast.warning(
          translate('shamu.mentions.checkDelivery', 'Check bot delivery: {{names}}', {
            names: failed.map((receipt) => receipt.name).join(', ')
          }),
          {
            id: request.id,
            description: failed
              .map((receipt) =>
                receipt.state === 'unconfirmed'
                  ? translate(
                      'shamu.mentions.unconfirmed',
                      'Delivery is unconfirmed. Check its chat before sending again.'
                    )
                  : (receipt.message ??
                    translate('shamu.mentions.refused', 'The bot did not receive the mention.'))
              )
              .join(' '),
            action,
            duration: 12_000
          }
        )
      } else if (delivered.length === 0) {
        toast.info(translate('shamu.mentions.self', 'This is already the bot’s own chat.'), {
          id: request.id,
          action
        })
      } else {
        toast.dismiss(request.id)
      }
    } catch (error) {
      toast.error(
        translate(
          'shamu.mentions.failed',
          'Your message was sent, but the bots could not be notified.'
        ),
        {
          id: request.id,
          description: error instanceof Error ? error.message : undefined,
          action: {
            label: translate('shamu.mentions.retry', 'Retry notification'),
            onClick: () => {
              void notify()
            }
          },
          duration: 12_000
        }
      )
    }
  }
  return notify
}
