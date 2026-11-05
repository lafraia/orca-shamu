import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED } from './helpers/structured-claude-stub'
import {
  launchPairedElectronClient,
  createRuntimeDesktopPairingOffer
} from './helpers/paired-electron-client'

test('bot badges count unread replies, persist across restart, and retire only viewed chats', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Launch paired desktops, exchange four synthetic replies and reopen the client with its saved read receipts.
  test.setTimeout(120_000)
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
      command: buildFakeAgentCommandOverride(claudeStub.command),
      workspaceDir: testInfo.outputPath('workspaces')
    }
  )
  const offer = await createRuntimeDesktopPairingOffer(primary)
  let client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
    extraEnv: { ORCA_SHAMU_CLIENT: '1' },
    connect: async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.getByLabel('Primary Orca access link', { exact: true }).fill(offer.pairingUrl)
      await page.getByRole('button', { name: 'Connect to primary Orca', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toHaveCount(0)
      const { environmentId } = await page.evaluate(() => window.api.shamuClient!.read())
      if (!environmentId) {
        throw new Error('Missing primary connection')
      }
      return environmentId
    }
  })
  try {
    const page = client.page
    await page.addInitScript(() => {
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false })
    })
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false })
    })
    const bots = page.getByRole('button', { name: 'Bots', exact: true })
    await bots.click()
    for (const name of ['CEO', 'Researcher']) {
      await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Bot name', { exact: true }).fill(name)
      await dialog.getByRole('button', { name: 'Create bot', exact: true }).click()
      const chat = page.getByRole('region', { name, exact: true })
      const composer = chat.locator('[data-native-chat-root="true"]').getByRole('textbox')
      await expect(composer).toBeVisible()
      await page.evaluate(() => window.api.projectChannels!.readUnread())
      const replies = name === 'CEO' ? 2 : 1
      for (let index = 0; index < replies; index++) {
        await composer.fill(`${name} synthetic request ${index + 1}`)
        await composer.press('Enter')
        await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(index + 1)
      }
      await expect
        .poll(async () =>
          page.evaluate(async (name) => {
            const bot = (await window.api.projectChannels!.read()).channels.find(
              (row) => row.name === name
            )!
            return (await window.api.projectChannels!.readUnread([bot.id])).counts[bot.id]
          }, name)
        )
        .toBe(replies)
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-description',
        replies === 1 ? '1 unread message' : `${replies} unread messages`
      )
    }
    await expect(bots).toHaveAttribute('aria-description', '3 unread messages')
    const saved = await page.evaluate(async () => {
      const snapshot = await window.api.projectChannels!.read()
      for (const bot of snapshot.channels) {
        await window.api.projectChannels!.command({
          action: 'organize',
          botId: bot.id,
          ...(bot.name === 'CEO' ? { pinned: true } : { section: 'Research' })
        })
      }
      return snapshot.channels.map((row) => ({ id: row.id, members: row.members }))
    })
    await expect(
      page
        .getByRole('region', { name: 'Pinned', exact: true })
        .getByRole('button', { name: 'CEO', exact: true })
    ).toHaveAttribute('aria-description', '2 unread messages')
    await expect(
      page
        .getByRole('region', { name: 'Research', exact: true })
        .getByRole('button', { name: 'Researcher', exact: true })
    ).toHaveAttribute('aria-description', '1 unread message')
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
    await expect(bots).toHaveAttribute('aria-description', '3 unread messages')
    await page.screenshot({ path: testInfo.outputPath('bot-badge-workspaces.png') })
    await page.reload()
    await bots.click()
    await expect(bots).toHaveAttribute('aria-description', '3 unread messages')
    await expect(page.getByRole('button', { name: 'CEO', exact: true })).toHaveAttribute(
      'aria-description',
      '2 unread messages'
    )
    await expect(page.getByRole('button', { name: 'Researcher', exact: true })).toHaveAttribute(
      'aria-description',
      '1 unread message'
    )
    await page.screenshot({ path: testInfo.outputPath('bot-badges-light.png') })
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('[data-variant="notification"]').first()).toHaveCSS(
      'animation-name',
      'none'
    )
    await page.screenshot({ path: testInfo.outputPath('bot-badges-dark.png') })
    // Simulate document visibility inside the hidden renderer without focusing a native window.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible'
      })
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    await expect(page.getByRole('button', { name: 'CEO', exact: true })).not.toHaveAttribute(
      'aria-description'
    )
    await expect(bots).toHaveAttribute('aria-description', '1 unread message')
    await expect(page.getByRole('button', { name: 'Researcher', exact: true })).toHaveAttribute(
      'aria-description',
      '1 unread message'
    )
    await page.getByRole('button', { name: 'Researcher', exact: true }).click()
    await expect(bots).not.toHaveAttribute('aria-description')
    await expect(page.locator('[data-variant="notification"]')).toHaveCount(0)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false })
      window.dispatchEvent(new Event('blur'))
    })
    const chat = page.getByRole('region', { name: 'Researcher', exact: true })
    const composer = chat.locator('[data-native-chat-root="true"]').getByRole('textbox')
    await composer.fill('Another response while this window is in the background.')
    await composer.press('Enter')
    await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(2)
    await expect(bots).toHaveAttribute('aria-description', '1 unread message')
    const profile = client.userDataDir
    const environmentId = client.environmentId
    await client.quitPreservingProfile()
    client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
      reuseUserDataDir: profile,
      extraEnv: { ORCA_SHAMU_CLIENT: '1' },
      connect: async (next) => {
        await next.setViewportSize({ width: 1280, height: 900 })
        expect((await next.evaluate(() => window.api.shamuClient!.read())).environmentId).toBe(
          environmentId
        )
        return environmentId
      }
    })
    await client.page.getByRole('button', { name: 'Bots', exact: true }).click()
    await expect(client.page.getByRole('button', { name: 'Bots', exact: true })).toHaveAttribute(
      'aria-description',
      '1 unread message'
    )
    expect(
      (await client.page.evaluate(() => window.api.projectChannels!.read())).channels.map(
        (row) => ({ id: row.id, members: row.members })
      )
    ).toEqual(saved)
    await expect(client.page.getByRole('button', { name: 'CEO', exact: true })).not.toHaveAttribute(
      'aria-description'
    )
    await expect(
      client.page.getByRole('button', { name: 'Researcher', exact: true })
    ).toHaveAttribute('aria-description', '1 unread message')
  } finally {
    await client.dispose()
  }
})
