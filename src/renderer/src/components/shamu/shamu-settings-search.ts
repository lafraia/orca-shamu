import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from '../settings/search/settings-search'

export const getShamuSettingsSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: 'Orca Shamu',
    description: translate(
      'shamu.settings.description',
      'An independent, open source fork of Orca maintained by Daniel Lafraia (lafraia).'
    ),
    keywords: [
      'shamu',
      'primary orca',
      'connection',
      'reconnect',
      'access link',
      'lafraia',
      'fork',
      'open source'
    ]
  },
  {
    title: translate('shamu.importPreferences', 'Import interface settings'),
    description: translate(
      'shamu.settings.importDescription',
      'Copy fonts, appearance and interface preferences from the primary Orca to Shamu.'
    ),
    keywords: ['shamu', 'import', 'font', 'appearance', 'settings']
  },
  {
    title: translate('shamu.project.termsTitle', 'License and disclaimer'),
    description: translate(
      'shamu.project.searchDescription',
      'Orca Shamu maintainer, source code, independence, MIT license, warranties and liability.'
    ),
    keywords: [
      'shamu',
      'lafraia',
      'license',
      'licença',
      'warranty',
      'garantia',
      'liability',
      'legal',
      'MIT',
      'fork',
      'open source'
    ]
  }
])
