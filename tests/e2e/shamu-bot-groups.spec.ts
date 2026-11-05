import { existsSync, readFileSync } from 'node:fs'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED } from './helpers/structured-claude-stub'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './helpers/paired-electron-client'

test('group menus rename all members, reorder sections and preserve drafts without sending prompts', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Two paired desktops provision four idle bot chats, edit groups and restore the saved sidebar.
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
  const client = await launchPairedElectronClient(offer, testInfo, 'Primary', {
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
  try {
    const page = client.page
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    for (const name of ['CEO', 'Mobile', 'Web', 'Platform']) {
      await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Bot name', { exact: true }).fill(name)
      await dialog.getByRole('button', { name: 'Create bot', exact: true }).click()
      await expect(
        page.getByRole('region', { name, exact: true }).getByRole('textbox')
      ).toBeVisible()
    }
    const saved = await page.evaluate(async () => {
      const snapshot = await window.api.projectChannels!.read()
      for (const bot of snapshot.channels) {
        await window.api.projectChannels!.command({
          action: 'organize',
          botId: bot.id,
          section: bot.name === 'Platform' ? 'Engineering' : 'Product',
          pinned: bot.name === 'CEO'
        })
      }
      return snapshot.channels.map(({ id, members, home }) => ({ id, members, home }))
    })
    const sidebar = page.getByRole('navigation', { name: 'Bots', exact: true })
    const groupNames = () =>
      sidebar
        .getByRole('region')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    await expect.poll(groupNames).toEqual(['Pinned', 'Product', 'Engineering'])
    const composer = page
      .getByRole('region', { name: 'Platform', exact: true })
      .getByRole('textbox')
    await composer.fill('Keep my unfinished draft')
    const frames = () =>
      existsSync(`${claudeStub.launchLog}.requests.jsonl`)
        ? readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .filter((row) => row.type === 'user').length
        : 0
    expect(frames()).toBe(0)
    await expect(sidebar.getByRole('button', { name: 'Product 2', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    await page.getByRole('button', { name: 'Group actions: Product', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Move up', exact: true })).toBeDisabled()
    await page.getByRole('menuitem', { name: 'Move down', exact: true }).click()
    await expect.poll(groupNames).toEqual(['Pinned', 'Engineering', 'Product'])
    await expect(sidebar.getByRole('button', { name: 'Product 2', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    const actions = page.getByRole('button', { name: 'Group actions: Product', exact: true })
    await actions.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Rename group…', exact: true }).click()
    const rename = page.getByRole('dialog', { name: 'Rename group', exact: true })
    const name = rename.getByLabel('Group name', { exact: true })
    await expect(name).toHaveValue('Product')
    await expect(name).toBeFocused()
    await name.fill('   ')
    await expect(rename.getByRole('button', { name: 'Save group', exact: true })).toBeDisabled()
    await name.fill('Engineering')
    await rename.getByRole('button', { name: 'Save group', exact: true }).click()
    await expect(rename.getByRole('alert')).toContainText('already exists')
    await name.fill('Development')
    await name.press('Enter')
    await expect(rename).toHaveCount(0)
    await expect.poll(groupNames).toEqual(['Pinned', 'Engineering', 'Development'])
    await expect(
      sidebar
        .getByRole('region', { name: 'Development', exact: true })
        .getByRole('button', { name: 'Mobile', exact: true })
    ).toBeVisible()
    await expect(
      sidebar
        .getByRole('region', { name: 'Development', exact: true })
        .getByRole('button', { name: 'Web', exact: true })
    ).toBeVisible()
    await expect(composer).toHaveText('Keep my unfinished draft')
    const snapshot = await page.evaluate(() => window.api.projectChannels!.read())
    expect(
      snapshot.channels.filter((bot) => bot.name !== 'Platform').map((bot) => bot.section)
    ).toEqual(['Development', 'Development', 'Development'])
    expect(snapshot.channels.map(({ id, members, home }) => ({ id, members, home }))).toEqual(saved)
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'light' })
    )
    await page.getByRole('button', { name: 'Group actions: Development', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Move down', exact: true })).toBeDisabled()
    await expect(page.getByRole('menu')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('bot-group-menu-light.png') })
    await page.keyboard.press('Escape')
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Group actions: Development', exact: true }).click()
    await expect(page.getByRole('menu')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('bot-group-menu-dark.png') })
    await page.getByRole('menuitem', { name: 'Move up', exact: true }).click()
    await expect.poll(groupNames).toEqual(['Pinned', 'Development', 'Engineering'])
    await sidebar.getByLabel('Find bot', { exact: true }).fill('Platform')
    await page.getByRole('button', { name: 'Group actions: Engineering', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Move up', exact: true }).click()
    await sidebar.getByLabel('Find bot', { exact: true }).fill('')
    await expect.poll(groupNames).toEqual(['Pinned', 'Engineering', 'Development'])
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await expect.poll(groupNames).toEqual(['Pinned', 'Engineering', 'Development'])
    await page.getByRole('button', { name: 'Platform', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Platform', exact: true }).getByRole('textbox')
    ).toHaveText('Keep my unfinished draft')
    expect(frames()).toBe(0)
    expect(
      (await page.evaluate(() => window.api.projectChannels!.read())).channels.map(
        ({ id, members, home }) => ({ id, members, home })
      )
    ).toEqual(saved)
  } finally {
    await client.dispose()
  }
})
