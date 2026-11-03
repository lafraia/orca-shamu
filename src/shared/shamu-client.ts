export const SHAMU_APP_NAME = 'Orca Shamu'
export const SHAMU_APP_ID = 'com.lafraia.orca-shamu'

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
}
