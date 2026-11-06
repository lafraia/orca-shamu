import type { ProjectChannelMember } from '../../../../shared/project-channels'
import { useAppStore } from '@/store'
import { isOrcaWindowForegroundFocused } from '../terminal-pane/terminal-notification-pane-visibility'
import { isPresenceConfirmed } from '@/hooks/agent-auto-ack-presence'
import { isTabOnScreen } from '@/hooks/agent-auto-ack-targets'
import { selectFloatingWorkspacePanelVisible } from '@/store/floating-workspace-panel-selector'
import { useProjectChannels } from './project-channel-store'
import { useBotUnread } from './bot-unread-store'

export function isBotChatViewed(botId: string, member: ProjectChannelMember): boolean {
  if (
    !isOrcaWindowForegroundFocused() ||
    !isPresenceConfirmed() ||
    (typeof document !== 'undefined' &&
      document.querySelector('[data-bot-communication-thread][data-state="open"]'))
  ) {
    return false
  }
  const state = useAppStore.getState()
  const bots = useProjectChannels.getState()
  return (
    (state.activeView === 'project-chat' &&
      bots.selectedId === botId &&
      !bots.editor &&
      useBotUnread.getState().openChatId === botId &&
      !selectFloatingWorkspacePanelVisible(state)) ||
    isTabOnScreen(state, member.worktreeId, member.tabId, 'structured')
  )
}
