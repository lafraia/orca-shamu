import type { Page, TestInfo } from '@playwright/test'
import { expect } from './orca-app'
import { waitForSessionReady } from './store'
import { buildFakeAgentCommandOverride } from './fake-agent-command-override'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './paired-electron-client'

export async function launchShamuBots(primary: Page, command: string, testInfo: TestInfo) {
  await waitForSessionReady(primary)
  await primary.evaluate(
    async ({ command, workspaceDir }) => {
      await window.__store!.getState().updateSettings({
        nativeChatProviders: { claude: true },
        defaultTuiAgent: 'claude',
        workspaceDir,
        agentCmdOverrides: { claude: command }
      })
    },
    {
      command: buildFakeAgentCommandOverride(command),
      workspaceDir: testInfo.outputPath('workspaces')
    }
  )
  const offer = await createRuntimeDesktopPairingOffer(primary)
  return launchPairedElectronClient(offer, testInfo, 'Primary', {
    extraEnv: { ORCA_SHAMU_CLIENT: '1' },
    connect: async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.getByLabel('Primary Orca access link', { exact: true }).fill(offer.pairingUrl)
      await page.getByRole('button', { name: 'Connect to primary Orca', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toHaveCount(0)
      const { environmentId } = await page.evaluate(() => window.api.shamuClient!.read())
      if (!environmentId) {
        throw new Error('Primary connection missing')
      }
      return environmentId
    }
  })
}

export async function createShamuBot(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Bot name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Create bot', exact: true }).click()
  await expect(page.getByRole('region', { name, exact: true }).getByRole('textbox')).toBeVisible()
}
