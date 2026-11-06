import { ipcRenderer } from 'electron'
import type { ProjectChannelsApi } from '../../shared/project-channels'
import { shamuVaultApi } from './shamu-vault-bridge'

export const projectChannelsApi: ProjectChannelsApi = {
  vault: shamuVaultApi,
  communications: {
    read: (sessionId) => ipcRenderer.invoke('projectChannels:communications', sessionId),
    texts: (ids) => ipcRenderer.invoke('projectChannels:communicationTexts', ids),
    onChanged: (listener) => {
      const handle = (): void => listener()
      ipcRenderer.on('projectChannels:communicationsChanged', handle)
      return () => ipcRenderer.removeListener('projectChannels:communicationsChanged', handle)
    }
  },
  readUnread: (ids) => ipcRenderer.invoke('projectChannels:readUnread', ids),
  markRead: (mark) => ipcRenderer.invoke('projectChannels:markRead', mark),
  onUnreadChanged: (listener) => {
    const handle = (_event: Electron.IpcRendererEvent, id: string): void => listener(id)
    ipcRenderer.on('projectChannels:unreadChanged', handle)
    return () => ipcRenderer.removeListener('projectChannels:unreadChanged', handle)
  },
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
