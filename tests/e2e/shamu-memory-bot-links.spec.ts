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

test('opens bot references from saved memory, sources and recalled notes without rewriting memory or sending messages', async ({
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
      const connection = await page.evaluate(() => window.api.shamuClient!.read())
      if (!connection.environmentId) {
        throw new Error('Missing primary connection')
      }
      return connection.environmentId
    }
  })
  const page = client.page
  const chat = (name: string) => page.getByRole('region', { name, exact: true })
  const createBot = async (name: string) => {
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Bot name', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: 'Create bot', exact: true }).click()
    await expect(chat(name).getByRole('textbox')).toBeVisible()
  }
  const openDev = async () => {
    await page.getByRole('button', { name: 'Dev: Vagalume', exact: true }).click()
    await expect(chat('Dev: Vagalume').getByRole('textbox')).toBeVisible()
  }
  const frames = () =>
    existsSync(`${claudeStub.launchLog}.requests.jsonl`)
      ? readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter((row) => row.type === 'user')
      : []
  try {
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await createBot('Source')
    await createBot('CEO')
    await chat('CEO').getByRole('textbox').fill('Keep the CEO draft')
    await createBot('Dev: Vagalume')
    await chat('Dev: Vagalume').getByRole('textbox').fill('Keep the developer draft')
    const saved = await page.evaluate(async () => {
      const api = window.api.projectChannels!
      const bots = (await api.read()).channels
      const ceo = bots.find((bot) => bot.name === 'CEO')!
      const dev = bots.find((bot) => bot.name === 'Dev: Vagalume')!
      const source = ceo.members.find((member) => member.id === ceo.home?.memberId)!
      const current = await api.readMemory(dev.id)
      const entry = {
        id: '11111111-1111-4111-8111-111111111111',
        key: 'coordination',
        kind: 'fact' as const,
        scope: 'vagalume',
        text: 'CEO coordinates Dev: Vagalume. Ask @CEO for priorities.',
        sources: [{ sessionId: source.sessionId, label: 'CEO, notification source-1' }],
        pinned: true,
        archived: false,
        updatedAt: Date.UTC(2026, 10, 5)
      }
      const snapshot = await api.writeMemory(
        dev.id,
        {
          version: 1,
          entries: [
            entry,
            {
              ...entry,
              id: '22222222-2222-4222-8222-222222222222',
              key: 'previous coordination',
              archived: true
            }
          ]
        },
        current.fingerprint
      )
      return { id: dev.id, snapshot }
    })
    const memory = page.getByRole('dialog', { name: 'Dev: Vagalume memory', exact: true })
    const openMemory = async () => {
      await chat('Dev: Vagalume').getByRole('button', { name: 'Memory', exact: true }).click()
      await expect(memory).toBeVisible()
    }
    await openMemory()
    await expect(
      memory.getByRole('button', { name: 'Open bot chat: Source', exact: true })
    ).toHaveCount(0)
    const entry = memory
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'coordination', exact: true }) })
    const source = entry.locator('p').filter({ hasText: 'Source:' })
    await expect(
      source.getByRole('button', { name: 'Open bot chat: CEO', exact: true })
    ).toBeVisible()
    await expect(
      entry.getByRole('button', { name: 'Open bot chat: Dev: Vagalume', exact: true })
    ).toBeVisible()
    await memory.getByRole('button', { name: 'Edit memory: coordination', exact: true }).click()
    await memory.getByLabel('Note', { exact: true }).fill('Unfinished memory edit')
    await expect(
      memory.getByRole('button', { name: 'Open bot chat: CEO', exact: true })
    ).toHaveCount(0)
    await expect(memory.getByLabel('Note', { exact: true })).toHaveValue('Unfinished memory edit')
    await memory.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(memory).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('memory-bot-references.png') })
    await source.getByRole('button', { name: 'Open bot chat: CEO', exact: true }).click()
    await expect(memory).toHaveCount(0)
    await expect(chat('CEO').getByRole('textbox')).toHaveText('Keep the CEO draft')
    expect(frames()).toHaveLength(0)
    await openDev()
    await expect(chat('Dev: Vagalume').getByRole('textbox')).toHaveText('Keep the developer draft')
    await openMemory()
    await memory.getByRole('button', { name: 'Previous versions', exact: true }).click()
    await memory.getByRole('button', { name: 'Open bot chat: CEO', exact: true }).last().click()
    await expect(chat('CEO').getByRole('textbox')).toBeVisible()
    expect(frames()).toHaveLength(0)
    await openDev()
    const composer = chat('Dev: Vagalume').getByRole('textbox')
    await composer.fill('Review the coordination note')
    await composer.press('Enter')
    await expect(chat('Dev: Vagalume').getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await chat('Dev: Vagalume').getByText('Recalled memory: 1', { exact: true }).click()
    await chat('Dev: Vagalume')
      .getByRole('button', { name: 'Open bot chat: CEO', exact: true })
      .first()
      .click()
    await expect(chat('CEO').getByRole('textbox')).toBeVisible()
    expect(frames()).toHaveLength(1)
    expect(
      await page.evaluate((id) => window.api.projectChannels!.readMemory(id), saved.id)
    ).toEqual(saved.snapshot)
  } finally {
    await client.dispose()
  }
})
