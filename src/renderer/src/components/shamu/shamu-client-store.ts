import { useAppStore } from '@/store'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { useShamuClient } from './shamu-client-state'
export { useShamuClient } from './shamu-client-state'

let loading: Promise<void> | null = null

async function hydratePrimary(environmentId: string): Promise<void> {
  const state = useAppStore.getState()
  const environments = await window.api.runtimeEnvironments.list()
  state.setRuntimeEnvironments(environments)
  if (!(await state.setActiveRuntimeEnvironmentPreference(environmentId))) {
    throw new Error('Could not reach the primary Orca.')
  }
  const options = { runtimeEnvironmentId: environmentId }
  await Promise.all([state.fetchRepos(options), state.fetchProjectGroups(options)])
  await state.fetchFolderWorkspaces(options)
  await state.fetchAllWorktrees({
    visibilityOwnerHostId: executionHostIdForStructuredTarget({
      kind: 'environment',
      environmentId
    })
  })
  await state.refreshRuntimeEnvironmentStatus(environmentId)
}

export function loadShamuClient(): Promise<void> {
  if (useShamuClient.getState().loaded) {
    return Promise.resolve()
  }
  if (loading) {
    return loading
  }
  loading = (async () => {
    const api = window.api.shamuClient
    if (!api) {
      useShamuClient.setState({ loaded: true })
      return
    }
    try {
      const connection = await api.read()
      useShamuClient.setState(connection)
      if (connection.enabled && connection.environmentId) {
        await hydratePrimary(connection.environmentId)
      }
      useShamuClient.setState({ loaded: true, error: false })
    } catch {
      useShamuClient.setState({ loaded: true, error: true })
    }
  })().finally(() => {
    loading = null
  })
  return loading
}

export async function connectShamuPrimary(pairingCode: string): Promise<void> {
  const api = window.api.shamuClient
  if (!api) {
    throw new Error('Shamu connection is unavailable.')
  }
  const connection = await api.connect(pairingCode)
  if (!connection.environmentId) {
    throw new Error('The primary Orca connection is unavailable.')
  }
  await hydratePrimary(connection.environmentId)
  useShamuClient.setState({ ...connection, loaded: true, error: false })
}

export async function reconnectShamuPrimary(): Promise<void> {
  const { environmentId } = useShamuClient.getState()
  if (!environmentId) {
    return
  }
  await window.api.runtimeEnvironments.connect({ selector: environmentId })
  await hydratePrimary(environmentId)
  useShamuClient.setState({ error: false })
}

export function reloadShamuClient(): Promise<void> {
  useShamuClient.setState({ loaded: false, error: false })
  return loadShamuClient()
}
