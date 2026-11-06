import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runProcess } from '@orca/process-host'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED } from './helpers/structured-claude-stub'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './helpers/paired-electron-client'
import type { BotReferenceContext } from '../../src/main/shamu-bots/bot-journal-reader'
import type { VaultAgentCommand } from '../../src/shared/shamu-vault'
import {
  installIsolatedVaultProtection,
  setIsolatedVaultWindowOpen
} from './helpers/shamu-vault-profile'

const MASTER = 'synthetic master passphrase for isolated UI'
const SECRET = 'synthetic vault credential for isolated UI'

test('manages encrypted bot credentials through desktop IPC and guards agent use', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'The isolated provider fixture requires POSIX.')
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
  let client = await launchPairedElectronClient(offer, testInfo, 'Primary', {
    extraEnv: { ORCA_SHAMU_CLIENT: '1' },
    connect: async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      const saved = await page.evaluate(() => window.api.shamuClient!.read())
      if (saved.environmentId) {
        return saved.environmentId
      }
      await page.getByLabel('Primary Orca access link', { exact: true }).fill(offer.pairingUrl)
      await page.getByRole('button', { name: 'Connect to primary Orca', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toHaveCount(0)
      const state = await page.evaluate(() => window.api.shamuClient!.read())
      if (!state.environmentId) {
        throw new Error('Missing isolated primary connection.')
      }
      return state.environmentId
    }
  })
  let page = client.page
  try {
    await installIsolatedVaultProtection(client)
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    const creation = page.getByRole('dialog')
    await creation.getByLabel('Bot name', { exact: true }).fill('Vault Alpha')
    await creation.getByRole('button', { name: 'Create bot', exact: true }).click()
    const chat = page.getByRole('region', { name: 'Vault Alpha', exact: true })
    await expect(chat.getByRole('textbox')).toBeVisible()
    await chat
      .getByRole('textbox')
      .fill('Use the synthetic service only after I approve the exact command in Vault.')
    await chat.getByRole('textbox').press('Enter')
    await expect(chat.getByText('Stub reply.', { exact: true })).toBeVisible()
    const bot = await page.evaluate(async () =>
      (await window.api.projectChannels!.read()).channels.find((row) => row.name === 'Vault Alpha')!
    )
    await chat.getByRole('button', { name: 'Vault', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Vault', exact: true })
    await panel.getByLabel('Master password', { exact: true }).fill(MASTER)
    await panel.getByLabel('Confirm master password', { exact: true }).fill(MASTER)
    await panel.getByRole('button', { name: 'Create Vault', exact: true }).click()
    await panel.getByRole('button', { name: 'New credential', exact: true }).click()
    await panel.getByLabel('Name', { exact: true }).fill('Synthetic service')
    await panel.getByLabel('Username', { exact: true }).fill('synthetic@example.test')
    await panel.getByLabel('Website', { exact: true }).fill('https://example.test')
    await panel.getByLabel('Password or token', { exact: true }).fill(SECRET)
    await panel.getByRole('button', { name: 'Save credential', exact: true }).click()
    await expect(
      panel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    const vaultCommand = async (command: VaultAgentCommand) => {
      const reply = await runProcess({
        program: process.execPath,
        args: [
          join(process.cwd(), 'out/cli/index.js'),
          'bots',
          'vault',
          '--profile-dir',
          client.userDataDir,
          '--input',
          JSON.stringify(command),
          '--json'
        ],
        timeoutMs: 30_000
      })
      if (reply.code !== 0) {
        const failure = JSON.parse(reply.stdout)
        throw new Error(`Isolated Vault CLI failed: ${JSON.stringify(failure.error)}`)
      }
      const response = JSON.parse(reply.stdout)
      expect(response.ok).toBe(true)
      expect(reply.stdout.includes(SECRET) || reply.stdout.includes(MASTER)).toBe(false)
      return response.result
    }
    const list = () => vaultCommand({ action: 'vault.list', actorId: bot.id })
    expect(await list()).toMatchObject({ state: 'unlocked', entries: [] })
    await panel
      .getByRole('button', { name: 'Edit credential: Synthetic service', exact: true })
      .click()
    await panel.getByLabel('Allow this bot to request use', { exact: true }).check()
    await panel.getByRole('button', { name: 'Save credential', exact: true }).click()
    await expect(
      panel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    const snapshot = await page.evaluate(
      async (id) => window.api.projectChannels!.vault!.status(id),
      bot.id
    )
    expect('secret' in snapshot.entries[0]).toBe(false)
    expect(await list()).toMatchObject({
      state: 'unlocked',
      entries: [{ name: 'Synthetic service' }]
    })
    const context = (await page.evaluate(
      async (id) =>
        window.api.projectChannels!.command({
          action: 'context',
          actorId: id,
          referenceId: 'self'
        }),
      bot.id
    )) as BotReferenceContext
    const source = context.messages.find((message) => message.role === 'user')!
    const requestId = randomUUID()
    await vaultCommand({
      action: 'vault.run' as const,
      actorId: bot.id,
      sourceItemId: source.id,
      requestId,
      entryId: snapshot.entries[0].id,
      program: process.execPath,
      args: ['--version']
    })
    await expect(panel.getByRole('region', { name: 'Credential requests' })).toBeVisible()
    await panel.getByRole('button', { name: 'Review and allow once', exact: true }).click()
    await expect(panel.getByRole('region', { name: 'Credential requests' })).toContainText('denied')
    expect(
      await vaultCommand({ action: 'vault.result', actorId: bot.id, requestId })
    ).toMatchObject({ state: 'denied' })
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((theme) => window.__store!.getState().updateSettings({ theme }), theme)
      await page.screenshot({
        path: testInfo.outputPath(`vault-unlocked-${theme}.png`),
        animations: 'disabled'
      })
    }
    await panel
      .getByRole('button', { name: 'Copy password: Synthetic service', exact: true })
      .click()
    await panel
      .getByLabel('Master password', { exact: true })
      .fill('incorrect synthetic master password')
    await panel.getByRole('button', { name: 'Copy password', exact: true }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    expect(await client.app.evaluate(({ clipboard }) => clipboard.readText() === '')).toBe(true)
    await panel.getByLabel('Master password', { exact: true }).fill(MASTER)
    await panel.getByRole('button', { name: 'Copy password', exact: true }).click()
    await expect(
      panel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    expect(
      await client.app.evaluate(
        ({ clipboard }, expected) => clipboard.readText() === expected,
        SECRET
      )
    ).toBe(true)
    await panel.getByRole('button', { name: 'Lock Vault', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Unlock Vault', exact: true })).toBeVisible()
    expect(await client.app.evaluate(({ clipboard }) => clipboard.readText() === '')).toBe(true)
    expect(await list()).toMatchObject({ state: 'locked', entries: [] })
    await page.screenshot({ path: testInfo.outputPath('vault-locked.png'), animations: 'disabled' })
    const file = readdirSync(client.userDataDir, { recursive: true }).find((path) =>
      String(path).endsWith(join('shamu-vault', 'vault.json'))
    )
    expect(file).toBeTruthy()
    const disk = readFileSync(join(client.userDataDir, String(file)), 'utf8')
    expect(
      [MASTER, SECRET, 'Synthetic service', 'synthetic@example.test'].some((value) =>
        disk.includes(value)
      )
    ).toBe(false)
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'Vault Alpha', exact: true }).click()
    await chat.getByRole('button', { name: 'Vault', exact: true }).click()
    await expect(
      panel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    await setIsolatedVaultWindowOpen(client, false)
    expect(await list()).toMatchObject({ state: 'locked', entries: [] })
    await setIsolatedVaultWindowOpen(client, true)
    await expect(
      panel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    const profile = client.userDataDir
    await client.quitPreservingProfile()
    const closed = await runProcess({
      program: process.execPath,
      args: [
        join(process.cwd(), 'out/cli/index.js'),
        'bots',
        'vault',
        '--profile-dir',
        profile,
        '--input',
        JSON.stringify({ action: 'vault.list', actorId: bot.id }),
        '--json'
      ],
      timeoutMs: 10_000
    })
    expect(closed.code).not.toBe(0)
    expect(closed.stdout.includes(SECRET) || closed.stdout.includes(MASTER)).toBe(false)
    await waitForSessionReady(primary)
    client = await launchPairedElectronClient(offer, testInfo, 'Primary', {
      reuseUserDataDir: profile,
      extraEnv: { ORCA_SHAMU_CLIENT: '1' },
      connect: async (page) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        const state = await page.evaluate(() => window.api.shamuClient!.read())
        if (!state.environmentId) {
          throw new Error('The isolated Shamu pairing was not retained.')
        }
        return state.environmentId
      }
    })
    page = client.page
    await installIsolatedVaultProtection(client)
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'Vault Alpha', exact: true }).click()
    await page
      .getByRole('region', { name: 'Vault Alpha', exact: true })
      .getByRole('button', { name: 'Vault', exact: true })
      .click()
    const reopenedPanel = page.getByRole('dialog', { name: 'Vault', exact: true })
    await expect(
      reopenedPanel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    await reopenedPanel
      .getByRole('button', { name: 'Delete credential: Synthetic service', exact: true })
      .click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(
      reopenedPanel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toBeVisible()
    await reopenedPanel
      .getByRole('button', { name: 'Delete credential: Synthetic service', exact: true })
      .click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete credential', exact: true })
      .click()
    await expect(
      reopenedPanel.getByRole('heading', { name: 'Synthetic service', exact: true })
    ).toHaveCount(0)
  } finally {
    await client.dispose()
  }
})
