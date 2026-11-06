import { useAppStore } from '@/store'
import { persistFloatingTerminalPanelOpen } from '../floating-terminal/floating-terminal-panel-view-state'
import { openProjectChannel, useProjectChannels } from '../project-channels/project-channel-store'

export function openNativeChatBot(id: string, beforeOpen?: () => void): boolean {
  if (!useProjectChannels.getState().snapshot.channels.some((row) => row.id === id)) {
    return false
  }
  beforeOpen?.()
  const state = useAppStore.getState()
  if (state.floatingWorkspacePanelOpen) {
    state.setFloatingWorkspacePanelOpen(false)
    persistFloatingTerminalPanelOpen(false)
  }
  openProjectChannel(id)
  return true
}
