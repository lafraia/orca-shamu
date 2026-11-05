import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from '../settings/search/settings-search'

export const getShamuSettingsSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: 'Orca Shamu',
    description: translate(
      'shamu.settings.description',
      'Settings and connection for this Orca Shamu interface.'
    ),
    keywords: ['shamu', 'primary orca', 'connection', 'reconnect', 'access link']
  },
  {
    title: translate('shamu.importPreferences', 'Import interface settings'),
    description: translate(
      'shamu.settings.importDescription',
      'Copy fonts, appearance and interface preferences from the primary Orca to Shamu.'
    ),
    keywords: ['shamu', 'import', 'font', 'appearance', 'settings']
  }
])
