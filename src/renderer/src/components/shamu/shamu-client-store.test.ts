import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  connectShamuPrimary,
  loadShamuClient,
  reconnectShamuPrimary,
  useShamuClient
} from './shamu-client-store'

const actions = vi.hoisted(() => ({
  setRuntimeEnvironments: vi.fn(),
  setActiveRuntimeEnvironmentPreference: vi.fn(),
  fetchRepos: vi.fn(),
  fetchProjectGroups: vi.fn(),
  fetchFolderWorkspaces: vi.fn(),
  fetchAllWorktrees: vi.fn(),
  refreshRuntimeEnvironmentStatus: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => actions } }))

beforeEach(() => {
  vi.clearAllMocks()
  actions.setActiveRuntimeEnvironmentPreference.mockResolvedValue(true)
  useShamuClient.setState({ enabled: true, environmentId: null, loaded: false, error: false })
  vi.stubGlobal('window', {
    api: {
      shamuClient: {
        read: vi.fn().mockResolvedValue({ enabled: true, environmentId: 'primary' }),
        connect: vi.fn().mockResolvedValue({ enabled: true, environmentId: 'primary' })
      },
      runtimeEnvironments: {
        list: vi.fn().mockResolvedValue([]),
        connect: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
})
afterEach(() => vi.unstubAllGlobals())

it('keeps the connection form available after hydration fails and can retry', async () => {
  actions.setActiveRuntimeEnvironmentPreference.mockResolvedValueOnce(false)
  await expect(connectShamuPrimary('fixture-link')).rejects.toThrow('Could not reach')
  expect(useShamuClient.getState().environmentId).toBeNull()
  expect(actions.fetchRepos).not.toHaveBeenCalled()

  await connectShamuPrimary('fixture-link')
  expect(useShamuClient.getState()).toMatchObject({ environmentId: 'primary', error: false })
  expect(actions.fetchRepos).toHaveBeenCalledWith({ runtimeEnvironmentId: 'primary' })
  expect(actions.fetchFolderWorkspaces).toHaveBeenCalledWith({ runtimeEnvironmentId: 'primary' })
})

it('retains a saved primary during an outage and clears the error after reconnecting', async () => {
  actions.setActiveRuntimeEnvironmentPreference.mockResolvedValueOnce(false)
  await loadShamuClient()
  expect(useShamuClient.getState()).toMatchObject({
    loaded: true,
    environmentId: 'primary',
    error: true
  })
  await reconnectShamuPrimary()
  expect(window.api.runtimeEnvironments.connect).toHaveBeenCalledWith({ selector: 'primary' })
  expect(useShamuClient.getState()).toMatchObject({ environmentId: 'primary', error: false })
})

it('exposes unreadable connection state as an error instead of opening the local workspace', async () => {
  vi.mocked(window.api.shamuClient!.read).mockRejectedValueOnce(new Error('Unreadable binding'))
  await loadShamuClient()
  expect(useShamuClient.getState()).toMatchObject({
    loaded: true,
    error: true,
    environmentId: null
  })
  expect(actions.fetchRepos).not.toHaveBeenCalled()
})
