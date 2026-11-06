import type { TerminalColdParkPolicyOverrides } from '../terminal-pane/terminal-hidden-view-parking'

export function shamuTerminalMemoryPolicy(enabled: boolean): TerminalColdParkPolicyOverrides {
  return enabled
    ? {
        coldParkDelayMs: 15_000,
        hotRetainMs: 60_000,
        hotRetainLimit: 1,
        retentionTtlMs: 5 * 60_000,
        retentionLimit: 1
      }
    : {}
}
