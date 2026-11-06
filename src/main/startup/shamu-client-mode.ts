import { SHAMU_APP_NAME } from '../../shared/shamu-client'
import { mainProcessState } from './main-process-state'

export function isShamuClientMode(): boolean {
  return (
    mainProcessState.devInstanceIdentity?.appName === SHAMU_APP_NAME ||
    process.env.ORCA_SHAMU_CLIENT === '1'
  )
}
