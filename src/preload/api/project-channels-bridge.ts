import { ipcRenderer } from 'electron'
import type { ProjectChannelsApi } from '../../shared/project-channels'

export const projectChannelsApi: ProjectChannelsApi = {
  read: () => ipcRenderer.invoke('projectChannels:read'),
  write: (snapshot) => ipcRenderer.invoke('projectChannels:write', snapshot)
}
