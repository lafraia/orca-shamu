import { afterEach, expect, it } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { getFloatingWorkspaceOperationRoute } from '../../lib/floating-workspace-operation-route'
import { isHostMirroredWorktree } from '../../runtime/web-session-tabs-sync/visibility-types'
import { useShamuClient } from './shamu-client-state'
import { createTestStore } from '../../store/slices/store-test-helpers'
import { applyWebSessionTabsSnapshot } from '../../runtime/web-session-tabs-sync/snapshot-api'
import { resolveOwner, runtimeEnvironmentIdUnlessTwin } from '../../lib/resolve-owner'

afterEach(() =>
  useShamuClient.setState({ enabled: false, environmentId: null, loaded: false, error: false })
)

it('keeps the ordinary floating workspace local', () => {
  expect(isHostMirroredWorktree(FLOATING_TERMINAL_WORKTREE_ID, 'primary')).toBe(false)
  expect(getFloatingWorkspaceOperationRoute(FLOATING_TERMINAL_WORKTREE_ID)).toEqual({
    executionHostId: 'local',
    runtimeEnvironmentId: null
  })
})

it('admits floating snapshots only from the Shamu primary and routes their controls there', () => {
  useShamuClient.setState({ enabled: true, environmentId: 'primary' })
  expect(isHostMirroredWorktree(FLOATING_TERMINAL_WORKTREE_ID, 'primary')).toBe(true)
  expect(isHostMirroredWorktree(FLOATING_TERMINAL_WORKTREE_ID, 'other')).toBe(false)
  expect(isHostMirroredWorktree(FLOATING_TERMINAL_WORKTREE_ID, '__local__')).toBe(false)
  expect(getFloatingWorkspaceOperationRoute(FLOATING_TERMINAL_WORKTREE_ID)).toEqual({
    executionHostId: 'runtime:primary',
    runtimeEnvironmentId: 'primary'
  })
  const state = createTestStore().getState()
  expect(resolveOwner(state, { workspaceId: FLOATING_TERMINAL_WORKTREE_ID })).toEqual({
    kind: 'resolved',
    owner: { endpoint: { kind: 'environment', environmentId: 'primary' }, at: 'local' }
  })
  expect(runtimeEnvironmentIdUnlessTwin(state, FLOATING_TERMINAL_WORKTREE_ID)).toBe('primary')
})

it('hydrates a primary floating chat with its original session identity', () => {
  useShamuClient.setState({ enabled: true, environmentId: 'primary' })
  const state = createTestStore().getState()
  const sessionId = 'claude_00000000_0000_4000_8000_000000000000'
  const patch = applyWebSessionTabsSnapshot(
    state,
    {
      worktree: FLOATING_TERMINAL_WORKTREE_ID,
      publicationEpoch: 'renderer:primary',
      snapshotVersion: 1,
      activeGroupId: null,
      tabs: [
        {
          type: 'agent-session',
          id: `agent-session:${sessionId}`,
          title: 'Side chat',
          sessionId,
          agent: 'claude',
          isActive: true
        }
      ],
      activeTabId: `agent-session:${sessionId}`,
      activeTabType: 'agent-session'
    },
    'primary'
  )
  const next = { ...state, ...patch }
  expect(next.unifiedTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID]).toEqual([
    expect.objectContaining({ entityId: sessionId, executionHostId: 'runtime:primary' })
  ])
})
