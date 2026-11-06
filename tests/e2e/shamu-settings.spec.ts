import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import {
  launchPairedElectronClient,
  createRuntimeDesktopPairingOffer
} from './helpers/paired-electron-client'

test('moves Shamu connection to the statusbar and exposes its own searchable settings', async ({
  orcaPage: primary
}, testInfo) => {
  // Start two isolated desktop profiles, pair them and reload the settings route.
  test.setTimeout(120_000)
  await waitForSessionReady(primary)
  await expect(primary).toHaveTitle('Orca')
  const offer = await createRuntimeDesktopPairingOffer(primary)
  const client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
    extraEnv: { ORCA_SHAMU_CLIENT: '1' },
    connect: async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await expect(page).toHaveTitle('Orca Shamu')
      await page.getByLabel('Primary Orca access link', { exact: true }).fill(offer.pairingUrl)
      await page.getByRole('button', { name: 'Connect to primary Orca', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toHaveCount(0)
      const connection = await page.evaluate(() => window.api.shamuClient!.read())
      if (!connection.environmentId) {
        throw new Error('Missing primary connection')
      }
      return connection.environmentId
    }
  })
  try {
    const page = client.page
    const status = page
      .locator('[data-orca-status-bar]')
      .getByRole('button', { name: 'Primary Orca Connected', exact: true })
    await expect(status).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import interface settings' })).toHaveCount(0)
    const titlebar = page.locator('.titlebar-left').first()
    const chrome = await titlebar.evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      drag: getComputedStyle(node).getPropertyValue('-webkit-app-region'),
      trafficLights:
        node.querySelector('.titlebar-traffic-light-pad')?.getBoundingClientRect().width ?? 0,
      mac: navigator.userAgent.includes('Mac')
    }))
    expect(chrome.top).toBeLessThan(2)
    expect(chrome.drag).toBe('drag')
    if (chrome.mac) {
      expect(chrome.trafficLights).toBeGreaterThan(0)
      const appName = titlebar.locator('.titlebar-app-name')
      await expect(appName).toHaveText('Orca Shamu')
      await expect(appName).toHaveAttribute('aria-label', 'Orca Shamu')
      expect(await appName.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
      await expect(primary.locator('.titlebar-app-name')).toHaveText('Orca')
    }
    await expect(page).toHaveTitle('Orca Shamu')
    await status.click()
    const section = page.locator('[data-settings-section="orca-shamu"]')
    await expect(section.getByRole('heading', { name: 'Orca Shamu', exact: true })).toBeVisible()
    await expect(section).toContainText('An independent, open source fork of Orca')
    const project = section.getByRole('region', { name: 'About this fork', exact: true })
    await expect(project).toContainText('Daniel Lafraia (lafraia)')
    await expect(project).toContainText('not an official Orca release')
    await expect(
      project.getByRole('link', { name: 'lafraia/orca-shamu', exact: true })
    ).toHaveAttribute('href', 'https://github.com/lafraia/orca-shamu')
    await expect(project.getByRole('link', { name: 'lafraia', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/lafraia'
    )
    await expect(
      project.getByRole('link', { name: 'Original Orca project', exact: true })
    ).toHaveAttribute('href', 'https://github.com/stablyai/orca')
    await expect(project.getByRole('link', { name: 'MIT license', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/lafraia/orca-shamu/blob/main/LICENSE'
    )
    await expect(project).toContainText('as is and as available')
    await expect(project).toContainText('disclaim liability')
    await expect(project).toContainText('does not exclude or limit mandatory legal rights')
    await expect(section.getByRole('button', { name: 'Import interface settings' })).toBeEnabled()
    await section.getByRole('button', { name: 'Update access link' }).click()
    await expect(page.getByRole('dialog').getByLabel('Primary Orca access link')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(section).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 1040 })
    await project.screenshot({ path: testInfo.outputPath('shamu-project-notice-light.png') })
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await project.screenshot({ path: testInfo.outputPath('shamu-project-notice-dark.png') })
    await page.reload()
    await expect(page).toHaveTitle('Orca Shamu')
    await expect(status).toBeVisible()
    await status.click()
    await expect(section.getByRole('button', { name: 'Import interface settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to app', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const search = page.getByPlaceholder('Search settings', { exact: true })
    await search.fill('garantia')
    await expect(page.getByRole('button', { name: /Orca Shamu/ }).first()).toBeVisible()
    await page
      .getByRole('button', { name: /Orca Shamu/ })
      .first()
      .click()
    await expect(section).toBeVisible()
    expect((await page.evaluate(() => window.api.shamuClient!.read())).environmentId).toBe(
      client.environmentId
    )
  } finally {
    await client.dispose()
  }
})
