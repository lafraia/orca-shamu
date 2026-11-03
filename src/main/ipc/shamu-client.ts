import { ipcMain } from 'electron'
import { z } from 'zod'
import { isShamuClientMode } from '../startup/shamu-client-mode'
import { createEmptyRateLimitState } from '../../shared/rate-limit-state-factory'
import type { Store } from '../persistence/loading-store/store'
import { ShamuPrimaryConnection } from '../shamu-primary-connection'
import { getRuntimeEnvironmentRegistryRoot } from './runtime-environments/runtime-environment-registry-root'
import { isTrustedUIRenderer } from './ui'

export function registerShamuClientHandlers(store: Store): ShamuPrimaryConnection | null {
  const enabled = isShamuClientMode()
  const connection = enabled
    ? new ShamuPrimaryConnection(
        store.getProfileStorageDirectory(),
        getRuntimeEnvironmentRegistryRoot()
      )
    : null
  if (enabled && !store.getOnboarding().closedAt) {
    store.updateOnboarding({
      closedAt: Date.now(),
      outcome: 'dismissed',
      checklist: { dismissed: true }
    })
  }
  if (enabled) {
    ipcMain.removeHandler('rateLimits:get')
    ipcMain.handle('rateLimits:get', () => createEmptyRateLimitState())
  }
  const trusted = (event: Electron.IpcMainInvokeEvent): void => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Untrusted Shamu connection request.')
    }
  }
  ipcMain.removeHandler('shamuClient:read')
  ipcMain.removeHandler('shamuClient:connect')
  ipcMain.handle('shamuClient:read', async (event) => {
    trusted(event)
    return { enabled, ...((await connection?.read()) ?? { environmentId: null }) }
  })
  ipcMain.handle('shamuClient:connect', async (event, input: unknown) => {
    trusted(event)
    if (!connection) {
      throw new Error('This application is not an Orca Shamu client.')
    }
    const pairingCode = z.string().trim().min(1).max(16_384).parse(input)
    const primary = await connection.connect(pairingCode)
    store.updateSettings(
      { activeRuntimeEnvironmentId: primary.environmentId },
      { notifyListeners: true }
    )
    return { enabled: true, ...primary }
  })
  return connection
}
