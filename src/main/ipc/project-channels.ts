import { ipcMain } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import { ProjectChannelsStore } from '../project-channels-store'
import { isTrustedUIRenderer } from './ui'
import type { ShamuPrimaryConnection } from '../shamu-primary-connection'
import { projectChannelsSnapshotSchema } from '../../shared/project-channels'

export function registerProjectChannelsHandlers(
  store: Store,
  primary?: ShamuPrimaryConnection | null
): void {
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
  ipcMain.handle('projectChannels:write', async (event, input: unknown) => {
    trusted(event)
    const snapshot = projectChannelsSnapshotSchema.parse(input)
    await primary?.assertChannelAuthority(snapshot)
    return channels.write(snapshot)
  })
}
