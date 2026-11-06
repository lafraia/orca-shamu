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

test.use({ claudeModelSwitching: true })

test('changes a bot model from its composer and retains each bot session, history and draft', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
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
      const state = await page.evaluate(() => window.api.shamuClient!.read())
      if (!state.environmentId) {
        throw new Error('Missing primary connection')
      }
      return state.environmentId
    }
  })
  const page = client.page
  const botChat = (name: string) => page.getByRole('region', { name, exact: true })
  const modelPicker = (name: string) => botChat(name).getByRole('button', { name: /^Model(?: |$)/ })
  const selectBot = async (name: string) => {
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name, exact: true }).click()
    await expect(botChat(name).getByRole('textbox')).toBeVisible()
  }
  const createBot = async (name: string) => {
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Bot name', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'Create bot', exact: true }).click()
    const composer = botChat(name).getByRole('textbox')
    await expect(composer).toBeVisible()
    await composer.fill(`Hello ${name}`)
    await composer.press('Enter')
    await expect(botChat(name).getByText('Stub reply.', { exact: true })).toHaveCount(1)
  }
  const chooseModel = async (name: string, label: string) => {
    await modelPicker(name).click()
    await page.getByRole('combobox').fill(label)
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
    await page.getByRole('option', { name: label, exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('option', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'true'
    )
    await page.getByRole('combobox').press('Escape')
    await expect(page.getByRole('combobox')).toHaveCount(0)
  }
  const expectSelectedModel = async (name: string, label: string) => {
    await modelPicker(name).click()
    await page.getByRole('combobox').fill(label)
    await expect(page.getByRole('option', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'true'
    )
    await page.getByRole('combobox').press('Escape')
  }
  const identity = () =>
    page.evaluate(async () =>
      (await window.api.projectChannels!.read()).channels.map((bot) => ({
        id: bot.id,
        name: bot.name,
        home: bot.home,
        members: bot.members
      }))
    )
  try {
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await createBot('Alpha')
    await createBot('Beta')
    const original = await identity()
    await selectBot('Alpha')
    await expect(modelPicker('Alpha')).toHaveCount(1)
    const composerBounds = await botChat('Alpha').getByRole('textbox').boundingBox()
    const modelBounds = await modelPicker('Alpha').boundingBox()
    expect(modelBounds!.y).toBeGreaterThanOrEqual(composerBounds!.y + composerBounds!.height)
    await botChat('Alpha').getByRole('textbox').fill('Alpha draft stays here')
    await chooseModel('Alpha', 'Test Sonnet')
    await expect(botChat('Alpha').getByRole('textbox')).toHaveText('Alpha draft stays here')
    await selectBot('Beta')
    await botChat('Beta').getByRole('textbox').fill('Beta draft stays here')
    await chooseModel('Beta', 'Test Haiku')
    await page.reload()
    await selectBot('Alpha')
    await expectSelectedModel('Alpha', 'Test Sonnet')
    await expect(botChat('Alpha').getByRole('textbox')).toHaveText('Alpha draft stays here')
    await expect(botChat('Alpha').getByText('Hello Alpha', { exact: true })).toBeVisible()
    await botChat('Alpha').getByRole('textbox').press('Enter')
    await expect(botChat('Alpha').getByText('Stub reply.', { exact: true })).toHaveCount(2)
    await expect(modelPicker('Alpha')).toContainText('Test Sonnet')
    await modelPicker('Alpha').click()
    await expect(page.getByRole('combobox')).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('bot-model-picker.png'),
      animations: 'disabled'
    })
    await page.getByRole('combobox').press('Escape')
    await selectBot('Beta')
    await expectSelectedModel('Beta', 'Test Haiku')
    await expect(botChat('Beta').getByRole('textbox')).toHaveText('Beta draft stays here')
    await botChat('Beta').getByRole('textbox').press('Enter')
    await expect(botChat('Beta').getByText('Stub reply.', { exact: true })).toHaveCount(2)
    expect(await identity()).toEqual(original)
    const requestsPath = `${claudeStub.launchLog}.requests.jsonl`
    expect(existsSync(requestsPath)).toBe(true)
    const requests = readFileSync(requestsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const sonnet = requests.find((row) => row.type === 'user' && row.model === 'sonnet')
    const haiku = requests.find((row) => row.type === 'user' && row.model === 'haiku')
    expect(sonnet).toBeTruthy()
    expect(haiku).toBeTruthy()
    expect(sonnet.pid).not.toBe(haiku.pid)
    expect(requests.filter((row) => row.type === 'user')).toHaveLength(4)
  } finally {
    if (existsSync(claudeStub.launchLog)) {
      await testInfo.attach('provider-launches', {
        path: claudeStub.launchLog,
        contentType: 'application/jsonl'
      })
    }
    if (existsSync(`${claudeStub.launchLog}.requests.jsonl`)) {
      await testInfo.attach('provider-requests', {
        path: `${claudeStub.launchLog}.requests.jsonl`,
        contentType: 'application/jsonl'
      })
    }
    await client.dispose()
  }
})
