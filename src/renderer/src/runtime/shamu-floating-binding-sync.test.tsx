// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { useShamuClient } from '../components/shamu/shamu-client-state'
import { useAppStore } from '../store'
import { replaceRuntimeEnvironmentRevisions } from './runtime-environment-revision'
import { resetWebSessionTabsSnapshotFreshnessForTests } from './web-session-tabs-sync/tracking-lifecycle'
import { useWebSessionTabsSync } from './web-session-tabs-sync/use-web-session-tabs-sync'
import {
  connectedRuntimeStatus,
  publicRuntimeEnvironment
} from './paired-runtime-environment-test-fixture'

vi.mock('./use-runtime-session-mirror-environment-key', () => ({
  useRuntimeSessionMirrorEnvironmentKeys: () => ({
    environmentKey: 'primary\u0001runtime-primary\u00011\u0001101',
    resubscribeSignal: ''
  })
}))
vi.mock('./web-session-terminal-orphan-recovery', () => ({
  recoverWebSessionTerminalOrphansBeforeApply: async (_state: unknown, snapshot: unknown) =>
    snapshot
}))

const initialState = useAppStore.getInitialState()

afterEach(() => {
  cleanup()
  useAppStore.setState(initialState, true)
  useShamuClient.setState({ enabled: false, environmentId: null, loaded: false, error: false })
  replaceRuntimeEnvironmentRevisions([])
  resetWebSessionTabsSnapshotFreshnessForTests()
})

it('reloads floating inventory when a binding arrives after the primary stream is active', async () => {
  const environments = [
    publicRuntimeEnvironment({ id: 'primary', createdAt: 100, pairingRevision: 101 })
  ]
  replaceRuntimeEnvironmentRevisions(environments)
  useShamuClient.setState({ enabled: true, environmentId: null })
  useAppStore.setState(
    {
      ...initialState,
      activeWorktreeId: null,
      workspaceSessionReady: true,
      runtimeEnvironments: environments,
      runtimeStatusByEnvironmentId: new Map([
        ['primary', connectedRuntimeStatus('runtime-primary', 1)]
      ])
    },
    true
  )
  const sessionId = 'claude_00000000_0000_4000_8000_000000000000'
  const call = vi.fn(async () => ({
    id: 'inventory',
    ok: true,
    _meta: { runtimeId: 'runtime-primary' },
    result: {
      snapshots: [
        {
          worktree: FLOATING_TERMINAL_WORKTREE_ID,
          publicationEpoch: 'renderer:primary',
          snapshotVersion: 1,
          activeTabId: `agent-session:${sessionId}`,
          activeTabType: 'agent-session',
          tabs: [
            {
              type: 'agent-session',
              id: `agent-session:${sessionId}`,
              sessionId,
              agent: 'claude',
              title: 'Side chat',
              isActive: true
            }
          ]
        }
      ]
    }
  }))
  const unsubscribe = vi.fn()
  const subscribe = vi.fn(async () => ({ unsubscribe, sendBinary: vi.fn() }))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { runtimeEnvironments: { call, subscribe } }
  })
  renderHook(() => useWebSessionTabsSync())
  await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))
  expect(
    useAppStore.getState().unifiedTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
  ).toBeUndefined()

  act(() => useShamuClient.setState({ environmentId: 'primary', loaded: true }))
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(useAppStore.getState().unifiedTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID]).toEqual([
      expect.objectContaining({ entityId: sessionId, executionHostId: 'runtime:primary' })
    ])
  )
})
