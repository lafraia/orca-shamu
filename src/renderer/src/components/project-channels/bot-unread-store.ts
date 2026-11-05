import { create } from 'zustand'
import type { BotUnreadSnapshot } from '../../../../shared/bot-unread'
import { translate } from '@/i18n/i18n'

export const useBotUnread = create<BotUnreadSnapshot & { openChatId: string | null }>(() => ({
  counts: {},
  pending: [],
  openChatId: null
}))
export function botUnreadDescription(count: number, pending = false): string | undefined {
  if (!count) {
    return undefined
  }
  if (count === 1) {
    return pending
      ? translate('shamu.bots.unreadAtLeastOne', 'At least 1 unread message')
      : translate('shamu.bots.unreadOne', '1 unread message')
  }
  return count > 99
    ? translate('shamu.bots.unreadMany', 'More than 99 unread messages')
    : pending
      ? translate('shamu.bots.unreadAtLeast', 'At least {{count}} unread messages', { count })
      : translate('shamu.bots.unreadCount', '{{count}} unread messages', { count })
}
