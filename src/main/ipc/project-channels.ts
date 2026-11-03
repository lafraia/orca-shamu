import { ipcMain } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import { ProjectChannelsStore } from '../project-channels-store'
import { isTrustedUIRenderer } from './ui'

export function registerProjectChannelsHandlers(store: Store): void {
  const channels = new ProjectChannelsStore(store.getProfileStorageDirectory())
  ipcMain.removeHandler('projectChannels:read')
  ipcMain.removeHandler('projectChannels:write')
  const trusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted project conversation request.')
    }
  }
  ipcMain.handle('projectChannels:read', (event) => {
    trusted(event)
    return channels.read()
  })
  ipcMain.handle('projectChannels:write', (event, snapshot: unknown) => {
    trusted(event)
    return channels.write(snapshot)
  })
}
