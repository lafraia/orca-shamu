import { ipcRenderer } from 'electron'
import type { ShamuVaultApi, VaultChange } from '../../shared/shamu-vault'

export const shamuVaultApi: ShamuVaultApi = {
  status: (botId) => ipcRenderer.invoke('shamuVault:status', botId),
  create: (botId, password) => ipcRenderer.invoke('shamuVault:create', botId, password),
  unlock: (botId, password) => ipcRenderer.invoke('shamuVault:unlock', botId, password),
  resume: (botId) => ipcRenderer.invoke('shamuVault:resume', botId),
  lock: () => ipcRenderer.invoke('shamuVault:lock'),
  save: (access, input) => ipcRenderer.invoke('shamuVault:save', access, input),
  remove: (access, id) => ipcRenderer.invoke('shamuVault:remove', access, id),
  copy: (access, id, password) => ipcRenderer.invoke('shamuVault:copy', access, id, password),
  changePassphrase: (access, current, next) =>
    ipcRenderer.invoke('shamuVault:changePassphrase', access, current, next),
  decide: (access, id, approve) => ipcRenderer.invoke('shamuVault:decide', access, id, approve),
  onChanged: (listener) => {
    const handle = (_event: Electron.IpcRendererEvent, change: VaultChange): void =>
      listener(change)
    ipcRenderer.on('shamuVault:changed', handle)
    return () => ipcRenderer.removeListener('shamuVault:changed', handle)
  }
}
