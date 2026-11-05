import { ipcRenderer } from 'electron'
import type { ProjectChannelsApi } from '../../shared/project-channels'

export const projectChannelsApi: ProjectChannelsApi = {
  readMemory: (id) => ipcRenderer.invoke('projectChannels:readMemory', id),
  writeMemory: (id, memory, fingerprint) =>
    ipcRenderer.invoke('projectChannels:writeMemory', id, memory, fingerprint),
  prepareMessage: (session, environment, text) =>
    ipcRenderer.invoke('projectChannels:prepareMessage', session, environment, text),
  notifyBots: (request) => ipcRenderer.invoke('projectChannels:notifyBots', request),
  read: () => ipcRenderer.invoke('projectChannels:read'),
  write: (snapshot) => ipcRenderer.invoke('projectChannels:write', snapshot),
  ensureConversation: (channelId) =>
    ipcRenderer.invoke('projectChannels:ensureConversation', channelId)
}
