import { expect, it } from 'vitest'
import { shamuTerminalMemoryPolicy } from './shamu-memory-policy'
import { selectColdParkedTerminalWorktrees } from '../terminal-pane/terminal-hidden-view-parking'

it('retains only the most recent hidden restorable workspace in Shamu', () => {
  const worktrees = Array.from({ length: 4 }, (_, index) => ({
    worktreeId: `workspace-${index}`,
    terminalTabs: [{ id: `tab-${index}`, ptyId: `workspace-${index}@@session` }],
    isVisible: false,
    shouldMeasureHiddenWorktree: false,
    hasActivityTerminalPortal: false,
    hiddenSinceMs: index
  }))
  const input = { worktrees, pendingStartupByTabId: {}, parkingEnabled: true, nowMs: 40_000 }
  expect(selectColdParkedTerminalWorktrees(input).size).toBe(0)
  expect(
    selectColdParkedTerminalWorktrees({ ...input, ...shamuTerminalMemoryPolicy(true) })
  ).toEqual(new Set(['workspace-0', 'workspace-1', 'workspace-2']))
  expect(shamuTerminalMemoryPolicy(false)).toEqual({})
})

it('preserves visible, starting and unrestorable views under the smaller budget', () => {
  const worktrees = [
    {
      worktreeId: 'visible',
      terminalTabs: [{ id: 'visible', ptyId: 'visible@@session' }],
      isVisible: true
    },
    {
      worktreeId: 'starting',
      terminalTabs: [{ id: 'starting', ptyId: 'starting@@session' }],
      isVisible: false
    },
    {
      worktreeId: 'unrestorable',
      terminalTabs: [{ id: 'unrestorable', ptyId: 'fail-open' }],
      isVisible: false
    }
  ].map((worktree) => ({
    ...worktree,
    shouldMeasureHiddenWorktree: false,
    hasActivityTerminalPortal: false,
    hiddenSinceMs: 0
  }))
  expect(
    selectColdParkedTerminalWorktrees({
      worktrees,
      pendingStartupByTabId: { starting: true },
      parkingEnabled: true,
      nowMs: 10 * 60_000,
      ...shamuTerminalMemoryPolicy(true)
    }).size
  ).toBe(0)
})
