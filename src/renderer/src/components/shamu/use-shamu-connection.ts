import { useAppStore } from '@/store'
import { runtimeHostContactForEntry } from '../../../../shared/remote-runtime/host-status/runtime-host-contact'
import { useShamuClient } from './shamu-client-state'

export function useShamuConnection() {
  const connection = useShamuClient()
  const reachable = useAppStore(
    (state) =>
      connection.environmentId !== null &&
      runtimeHostContactForEntry(state.runtimeStatusByEnvironmentId.get(connection.environmentId))
        .verdict === 'live'
  )
  return { ...connection, live: reachable && !connection.error }
}
