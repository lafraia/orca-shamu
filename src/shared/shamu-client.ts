import type { GlobalSettings } from './global-settings-types'

export const SHAMU_APP_NAME = 'Orca Shamu'
export const SHAMU_APP_ID = 'com.lafraia.orca-shamu'
export const SHAMU_REPOSITORY_URL = 'https://github.com/lafraia/orca-shamu'
export const SHAMU_UPSTREAM_URL = 'https://github.com/stablyai/orca'
export const SHAMU_LICENSE_URL = `${SHAMU_REPOSITORY_URL}/blob/main/LICENSE`

export function isShamuDistribution(version: string): boolean {
  return /(?:-|\.)shamu\.[0-9]/.test(version)
}

export type ShamuClientState = {
  enabled: boolean
  environmentId: string | null
}

export type ShamuClientApi = {
  read: () => Promise<ShamuClientState>
  connect: (pairingCode: string) => Promise<ShamuClientState>
  readPrimaryPreferences: () => Promise<Partial<GlobalSettings>>
}
