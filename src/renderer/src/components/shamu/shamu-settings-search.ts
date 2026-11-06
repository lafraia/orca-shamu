import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../settings/search/settings-search-keywords'
import type { SettingsSearchEntry } from '../settings/search/settings-search'

export const getShamuSettingsSearchEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('shamu.title', 'Orca Shamu'),
    description: translate(
      'shamu.settings.description',
      'An independent, open source fork of Orca maintained by Daniel Lafraia (lafraia).'
    ),
    keywords: [
      ...translateSearchKeyword('shamu.search.shamu', 'shamu', { englishOnly: true }),
      ...translateSearchKeyword('shamu.search.primaryOrca', 'primary orca'),
      ...translateSearchKeyword('shamu.search.connection', 'connection'),
      ...translateSearchKeyword('shamu.search.reconnect', 'reconnect'),
      ...translateSearchKeyword('shamu.search.accessLink', 'access link'),
      ...translateSearchKeyword('shamu.search.maintainer', 'lafraia', { englishOnly: true }),
      ...translateSearchKeyword('shamu.search.fork', 'fork'),
      ...translateSearchKeyword('shamu.search.openSource', 'open source')
    ]
  },
  {
    title: translate('shamu.importPreferences', 'Import interface settings'),
    description: translate(
      'shamu.settings.importDescription',
      'Copy fonts, appearance and interface preferences from the primary Orca to Shamu.'
    ),
    keywords: [
      ...translateSearchKeyword('shamu.search.shamu', 'shamu', { englishOnly: true }),
      ...translateSearchKeyword('shamu.search.import', 'import'),
      ...translateSearchKeyword('shamu.search.font', 'font'),
      ...translateSearchKeyword('shamu.search.appearance', 'appearance'),
      ...translateSearchKeyword('shamu.search.settings', 'settings')
    ]
  },
  {
    title: translate('shamu.project.termsTitle', 'License and disclaimer'),
    description: translate(
      'shamu.project.searchDescription',
      'Orca Shamu maintainer, source code, independence, MIT license, warranties and liability.'
    ),
    keywords: [
      ...translateSearchKeyword('shamu.search.shamu', 'shamu', { englishOnly: true }),
      ...translateSearchKeyword('shamu.search.maintainer', 'lafraia', { englishOnly: true }),
      ...translateSearchKeyword('shamu.search.license', 'license', { aliases: ['licença'] }),
      ...translateSearchKeyword('shamu.search.warranty', 'warranty', { aliases: ['garantia'] }),
      ...translateSearchKeyword('shamu.search.liability', 'liability'),
      ...translateSearchKeyword('shamu.search.legal', 'legal'),
      ...translateSearchKeyword('shamu.search.mit', 'MIT', { englishOnly: true }),
      ...translateSearchKeyword('shamu.search.fork', 'fork'),
      ...translateSearchKeyword('shamu.search.openSource', 'open source')
    ]
  }
])
