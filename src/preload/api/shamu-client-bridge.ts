import { ipcRenderer } from 'electron'
import type { ShamuClientApi } from '../../shared/shamu-client'

export const shamuClientApi: ShamuClientApi = {
  read: () => ipcRenderer.invoke('shamuClient:read'),
  connect: (pairingCode) => ipcRenderer.invoke('shamuClient:connect', pairingCode)
}
