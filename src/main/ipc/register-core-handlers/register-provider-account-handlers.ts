import type { Store } from '../../persistence/loading-store/store'
import type { CodexAccountService } from '../../codex-accounts/service'
import type { ClaudeAccountService } from '../../claude-accounts/service'
import type { RateLimitService } from '../../rate-limits/service'
import { registerRateLimitHandlers } from '../rate-limits'
import { registerCodexAccountHandlers } from '../codex-accounts'
import { registerCodexConfigSyncHandlers } from '../codex-config-sync'
import { registerClaudeAccountHandlers } from '../claude-accounts'
import { registerOpenCodeGoCredentialsHandlers } from '../opencode-go-credentials'
import { registerMiniMaxCredentialsHandlers } from '../minimax-credentials'
import { registerZcodePlanCredentialsHandlers } from '../zcode-plan-credentials'
import { registerGrokAccountHandlers } from '../grok-accounts'
import { registerCursorAccountHandlers } from '../cursor-accounts'

export function registerProviderAccountHandlers(
  store: Store,
  codexAccounts: CodexAccountService | null,
  claudeAccounts: ClaudeAccountService | null,
  rateLimits: RateLimitService | null
): void {
  if (codexAccounts && claudeAccounts && rateLimits) {
    registerCodexAccountHandlers(codexAccounts, () => store.getSettings())
    registerCodexConfigSyncHandlers(codexAccounts.runtimeHomeService)
    registerClaudeAccountHandlers(claudeAccounts)
    registerOpenCodeGoCredentialsHandlers(rateLimits)
    registerMiniMaxCredentialsHandlers(rateLimits)
    registerZcodePlanCredentialsHandlers(rateLimits)
    registerGrokAccountHandlers()
    registerCursorAccountHandlers()
    registerRateLimitHandlers(rateLimits, codexAccounts)
  }
}
