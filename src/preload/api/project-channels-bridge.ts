import { ipcRenderer } from 'electron'
import type { ProjectChannelsApi } from '../../shared/project-channels'

export const projectChannelsApi: ProjectChannelsApi = {
  command: (command) => ipcRenderer.invoke('projectChannels:command', command),
  onChanged: (listener) => {
    const handle = (): void => listener()
    ipcRenderer.on('projectChannels:changed', handle)
    return () => ipcRenderer.removeListener('projectChannels:changed', handle)
  },
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
