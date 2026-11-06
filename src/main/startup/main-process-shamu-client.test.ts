import { expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  createAccounts: vi.fn(),
  createMigration: vi.fn(),
  state: {
    store: { getSettings: () => ({}), updateSettings: vi.fn() },
    codexAccounts: null,
    codexRuntimeHome: null,
    claudeAccounts: null,
    claudeRuntimeAuth: null,
    rateLimits: null,
    keybindings: null
  }
}))
vi.mock('electron', () => ({ app: { getPath: () => '/disposable-shamu-home' } }))
vi.mock('./main-process-state', () => ({ mainProcessState: fixture.state }))
vi.mock('./shamu-client-mode', () => ({ isShamuClientMode: () => true }))
vi.mock('../provider-account-services', () => ({
  createProviderAccountServices: fixture.createAccounts
}))
vi.mock('../codex/codex-session-migration-scheduler', () => ({
  createCodexSessionMigrationScheduler: fixture.createMigration
}))
vi.mock('../agent-hooks/server', () => ({ agentHookServer: {} }))
vi.mock('../browser/browser-manager', () => ({
  browserManager: { setSettingsResolver: vi.fn() }
}))
vi.mock('../keybindings/keybinding-service', () => ({ KeybindingService: class {} }))

import { initializeMainProcessAccountServices } from './main-process-account-services'

it('starts frontend keybindings without initializing account auth, quotas or session migration', () => {
  initializeMainProcessAccountServices()
  expect(fixture.state.keybindings).not.toBeNull()
  expect(fixture.createAccounts).not.toHaveBeenCalled()
  expect(fixture.createMigration).not.toHaveBeenCalled()
  expect(fixture.state).toMatchObject({
    codexAccounts: null,
    codexRuntimeHome: null,
    claudeAccounts: null,
    claudeRuntimeAuth: null,
    rateLimits: null
  })
})
