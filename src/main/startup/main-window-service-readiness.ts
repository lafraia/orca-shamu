/** Keep ordered, specific diagnostics for partially initialized windows. */
const MAIN_WINDOW_SERVICE_REQUIREMENTS = [
  ['store', 'Store must be initialized before opening the main window'],
  ['runtime', 'Runtime must be initialized before opening the main window'],
  ['stats', 'Stats must be initialized before opening the main window'],
  ['claudeUsage', 'Claude usage store must be initialized before opening the main window'],
  ['codexUsage', 'Codex usage store must be initialized before opening the main window'],
  ['openCodeUsage', 'OpenCode usage store must be initialized before opening the main window'],
  ['museUsage', 'Muse usage store must be initialized before opening the main window'],
  ['rateLimits', 'Rate limit service must be initialized before opening the main window'],
  ['automations', 'Automation service must be initialized before opening the main window'],
  ['codexAccounts', 'Codex account service must be initialized before opening the main window'],
  [
    'codexRuntimeHome',
    'Codex runtime home service must be initialized before opening the main window'
  ],
  ['claudeAccounts', 'Claude account service must be initialized before opening the main window'],
  [
    'claudeRuntimeAuth',
    'Claude runtime auth service must be initialized before opening the main window'
  ],
  ['keybindings', 'Keybinding service must be initialized before opening the main window']
] as const

type MainWindowServiceKey = (typeof MAIN_WINDOW_SERVICE_REQUIREMENTS)[number][0]
type ProviderServiceKey =
  | 'rateLimits'
  | 'codexAccounts'
  | 'codexRuntimeHome'
  | 'claudeAccounts'
  | 'claudeRuntimeAuth'
const PROVIDER_SERVICE_KEYS = new Set<string>([
  'rateLimits',
  'codexAccounts',
  'codexRuntimeHome',
  'claudeAccounts',
  'claudeRuntimeAuth'
])

type RequiredServices<T extends Record<MainWindowServiceKey, unknown>> = {
  [K in keyof T]: K extends ProviderServiceKey ? T[K] : NonNullable<T[K]>
}

export function requireMainWindowServices<T extends Record<MainWindowServiceKey, unknown>>(
  services: T,
  primaryClient = false
): RequiredServices<T> {
  for (const [key, message] of MAIN_WINDOW_SERVICE_REQUIREMENTS) {
    if (primaryClient && PROVIDER_SERVICE_KEYS.has(key)) {
      continue
    }
    if (!services[key]) {
      throw new Error(message)
    }
  }
  return services as RequiredServices<T>
}
