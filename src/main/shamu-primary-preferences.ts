import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getDefaultSettings } from '../shared/constants'
import type { GlobalSettings } from '../shared/global-settings-types'
import { getOrcaProfileStateDatabaseFile } from '../shared/profile-state-storage-paths'
import { readProfileStateDomain } from './persistence/profile-state/profile-state-domain-reader'
import { tryReadMetadata } from '../cli/runtime/metadata'

export const SHAMU_INTERFACE_SETTINGS = [
  'theme',
  'uiLanguage',
  'appFontFamily',
  'leftSidebarAppearanceMode',
  'leftSidebarTintColor',
  'leftSidebarTintOpacity',
  'editorFontFamily',
  'editorFontSize',
  'editorFontWeight',
  'editorLineHeight',
  'editorLigatures',
  'codeFontSmoothing',
  'editorMinimapEnabled',
  'editorWordWrap',
  'richMarkdownSpellcheckEnabled',
  'markdownReviewToolsEnabled',
  'terminalFontSize',
  'terminalFontFamily',
  'terminalFontWeight',
  'terminalFontWeightBold',
  'terminalLineHeight',
  'terminalLigatures',
  'terminalCursorStyle',
  'terminalCursorBlink',
  'terminalThemeDark',
  'terminalThemeLight',
  'terminalUseSeparateLightTheme',
  'terminalCustomThemes',
  'terminalDividerColorDark',
  'terminalDividerColorLight',
  'terminalDividerThicknessPx',
  'terminalActivePaneOpacity',
  'terminalInactivePaneOpacity',
  'terminalBackgroundOpacity',
  'terminalPaddingX',
  'terminalPaddingY',
  'terminalMinimumContrastRatio',
  'nativeChatAppearance',
  'nativeChatInlineVisuals',
  'nativeChatLinkPreviews',
  'floatingTerminalEnabled',
  'floatingTerminalTriggerLocation',
  'rightSidebarOpenByDefault'
] as const satisfies readonly (keyof GlobalSettings)[]

export function selectShamuInterfacePreferences(
  settings: Record<string, unknown>,
  home: string
): Partial<GlobalSettings> {
  const values = { ...getDefaultSettings(home), ...settings }
  return Object.fromEntries(SHAMU_INTERFACE_SETTINGS.map((key) => [key, values[key]]))
}

export async function readShamuPrimaryPreferences(
  directory: string,
  runtimeId: string,
  home: string
): Promise<Partial<GlobalSettings>> {
  if (tryReadMetadata(directory)?.runtimeId !== runtimeId) {
    throw new Error('The paired primary does not own this local Orca profile.')
  }
  const index = z
    .object({ activeProfileId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/) })
    .parse(JSON.parse(await readFile(join(directory, 'orca-profile-index.json'), 'utf8')))
  const result = readProfileStateDomain(
    getOrcaProfileStateDatabaseFile(index.activeProfileId, directory),
    index.activeProfileId,
    'settings'
  )
  if (result.kind !== 'value') {
    throw new Error('Could not read the primary Orca interface settings.')
  }
  const settings = z.record(z.string(), z.unknown()).parse(result.value)
  return selectShamuInterfacePreferences(settings, home)
}
