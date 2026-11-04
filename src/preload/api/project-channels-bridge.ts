import { ipcRenderer } from 'electron'
import type { ProjectChannelsApi } from '../../shared/project-channels'

export const projectChannelsApi: ProjectChannelsApi = {
  notifyBots: (request) => ipcRenderer.invoke('projectChannels:notifyBots', request),
  read: () => ipcRenderer.invoke('projectChannels:read'),
  write: (snapshot) => ipcRenderer.invoke('projectChannels:write', snapshot),
  ensureConversation: (channelId) =>
    ipcRenderer.invoke('projectChannels:ensureConversation', channelId)
}
