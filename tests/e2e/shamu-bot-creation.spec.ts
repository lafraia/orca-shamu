import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED } from './helpers/structured-claude-stub'
import {
  launchPairedElectronClient,
  createRuntimeDesktopPairingOffer
} from './helpers/paired-electron-client'

test('creates and reopens permanent native bot chats, including existing empty bots', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Cold-start two desktops and reopen the paired client with its persisted native chat.
  test.setTimeout(120_000)
  await waitForSessionReady(primary)
  const command = buildFakeAgentCommandOverride(claudeStub.command)
  await primary.evaluate(
    async ({ command, workspaceDir }) => {
      await window.__store!.getState().updateSettings({
        nativeChatProviders: { claude: true },
        defaultTuiAgent: 'claude',
        workspaceDir,
        agentCmdOverrides: { claude: command }
      })
    },
    { command, workspaceDir: testInfo.outputPath('workspaces') }
  )
  const offer = await createRuntimeDesktopPairingOffer(primary)
  let client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
    extraEnv: { ORCA_SHAMU_CLIENT: '1' },
    connect: async (page) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toBeVisible()
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
    const connection = page
      .locator('[data-orca-status-bar]')
      .getByRole('button', { name: 'Primary Orca Connected', exact: true })
    await expect(connection).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import interface settings' })).toHaveCount(0)
    await expect(page.locator('.shamu-connection-status')).toHaveCount(0)
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Choose chat tab', { exact: true })).toHaveCount(0)
    await dialog.getByLabel('Bot name', { exact: true }).fill('Coordinator')
    await dialog.getByRole('button', { name: 'violet', exact: true }).click()
    await dialog.getByLabel('Bot image', { exact: true }).setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    })
    await expect(dialog.locator('.bot-avatar img')).toBeVisible()
    await dialog
      .getByLabel('Instructions (optional)', { exact: true })
      .fill('Organize work and report progress.')
    await dialog.getByLabel('Bot name', { exact: true }).press('Enter')
    await expect(dialog).toHaveCount(0)
    const bot = page.getByRole('region', { name: 'Coordinator', exact: true })
    const composer = bot.locator('[data-native-chat-root="true"]').getByRole('textbox')
    await expect(composer).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(bot.locator('.bot-avatar')).toHaveCount(1)
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await expect(page.locator('html')).toHaveClass(/dark/)
    await bot.getByRole('button', { name: 'Bot settings', exact: true }).click()
    await dialog.getByRole('button', { name: 'Use bot icon', exact: true }).click()
    await expect(dialog.locator('.bot-avatar-face')).toHaveCSS('animation-name', 'none')
    await page.screenshot({ path: testInfo.outputPath('bot-identity-settings-dark.png') })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'light' })
    )
    await expect(bot.getByRole('button', { name: /^Conversations/ })).toHaveCount(0)
    await bot.getByRole('button', { name: 'Memory', exact: true }).click()
    const memory = page.getByRole('dialog', { name: 'Coordinator memory', exact: true })
    await expect(memory.getByText('No saved notes yet', { exact: true })).toBeVisible()
    await memory.getByRole('button', { name: 'Add memory', exact: true }).click()
    await memory.getByLabel('Topic', { exact: true }).fill('Proposal deadline')
    await memory.getByLabel('Project or scope', { exact: true }).fill('Vagalume')
    await memory.getByLabel('Note', { exact: true }).fill('The proposal is due Tuesday.')
    await memory.getByRole('button', { name: 'Save memory', exact: true }).click()
    await expect(memory.getByText('The proposal is due Tuesday.', { exact: true })).toBeVisible()
    await memory
      .getByRole('button', { name: 'Edit memory: Proposal deadline', exact: true })
      .click()
    await memory.getByLabel('Note', { exact: true }).fill('Correction: the proposal is due Friday.')
    await memory.getByRole('button', { name: 'Save memory', exact: true }).click()
    await expect(
      memory.getByText('Correction: the proposal is due Friday.', { exact: true })
    ).toBeVisible()
    await memory.getByRole('button', { name: 'Previous versions', exact: true }).click()
    await expect(memory.getByText('The proposal is due Tuesday.', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('bot-memory-previous-version.png') })
    await memory.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(memory).toHaveCount(0)
    await composer.fill('Hello from my permanent bot chat. What is the proposal deadline?')
    await composer.press('Enter')
    await expect(bot.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    await expect(bot.getByText('Recalled memory: 1', { exact: true })).toBeVisible()
    await expect(bot).not.toContainText('[Orca Shamu bot context v1]')
    const snapshot = await page.evaluate(() => window.api.projectChannels!.read())
    const channel = snapshot.channels[0]
    expect(channel.home?.ready).toBe(true)
    expect(channel.identity).toMatchObject({
      color: 'violet',
      image: expect.stringMatching(/^data:image\/png;base64,/)
    })
    expect(channel.members).toHaveLength(1)
    expect(channel.members[0].target).toEqual({
      kind: 'environment',
      environmentId: client.environmentId
    })
    const config = JSON.parse(readFileSync(path.join(channel.home!.directory, 'bot.json'), 'utf8'))
    expect(config).toMatchObject({
      name: 'Coordinator',
      instructions: 'Organize work and report progress.'
    })
    await expect
      .poll(() =>
        primary.evaluate(
          (member) =>
            window
              .__store!.getState()
              .unifiedTabsByWorktree[member.worktreeId]?.filter(
                (row) => row.entityId === member.sessionId
              ).length ?? 0,
          channel.members[0]
        )
      )
      .toBe(1)
    await page.screenshot({ path: testInfo.outputPath('permanent-bot-chat.png') })
    await composer.fill('A draft to resume later')
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await expect(composer).toHaveText('A draft to resume later')
    await expect(bot.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    expect(
      (await page.evaluate(() => window.api.projectChannels!.read())).channels[0].members
    ).toEqual(channel.members)
    await bot.getByRole('button', { name: 'Bot settings', exact: true }).click()
    await dialog
      .getByLabel('Instructions (optional)', { exact: true })
      .fill('Track milestones and report progress.')
    await dialog.getByRole('button', { name: 'Save bot', exact: true }).click()
    await expect
      .poll(
        () =>
          JSON.parse(readFileSync(path.join(channel.home!.directory, 'bot.json'), 'utf8'))
            .instructions
      )
      .toBe('Track milestones and report progress.')
    await expect(bot.getByRole('button', { name: /^Conversations/ })).toHaveCount(0)
    const recalled = await page.evaluate(
      async (member) =>
        window.api.projectChannels!.prepareMessage(
          member.sessionId,
          member.target.kind === 'environment' ? member.target.environmentId : null,
          'What is the proposal deadline?'
        ),
      channel.members[0]
    )
    expect(recalled).toContain('due Friday')
    expect(recalled).not.toContain('due Tuesday')
    await bot.getByRole('button', { name: 'Memory', exact: true }).click()
    await expect(
      memory.getByText('Correction: the proposal is due Friday.', { exact: true })
    ).toBeVisible()
    await memory.getByRole('button', { name: 'Review with bot', exact: true }).click()
    await expect(composer).toContainText('A draft to resume later')
    await expect(composer).toContainText('Organize your durable memory now.')
    await composer.fill('A draft to resume later')
    await page.evaluate(async () => {
      const snapshot = await window.api.projectChannels!.read()
      await window.api.projectChannels!.write({
        ...snapshot,
        channels: [
          ...snapshot.channels,
          {
            id: 'existing-ceo',
            name: 'CEO',
            instructions: 'Coordinate the projects.',
            mainMemberId: null,
            members: [],
            messages: [],
            draft: '',
            createdAt: Date.now()
          }
        ]
      })
    })
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    await expect(
      page
        .getByRole('region', { name: 'CEO', exact: true })
        .locator('[data-native-chat-root="true"]')
        .getByRole('textbox')
    ).toBeVisible()
    const migrated = await page.evaluate(() => window.api.projectChannels!.read())
    expect(migrated.channels[0].members).toEqual(channel.members)
    expect(migrated.channels[1]).toMatchObject({
      id: 'existing-ceo',
      name: 'CEO',
      home: { ready: true }
    })
    expect(
      new Set(migrated.channels.flatMap((row) => row.members.map((member) => member.sessionId)))
        .size
    ).toBe(2)
    const environmentId = client.environmentId
    const profile = client.userDataDir
    await client.quitPreservingProfile()
    client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
      reuseUserDataDir: profile,
      extraEnv: { ORCA_SHAMU_CLIENT: '1' },
      connect: async (page) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        const connection = await page.evaluate(() => window.api.shamuClient!.read())
        expect(connection.environmentId).toBe(environmentId)
        return environmentId
      }
    })
    await client.page.getByRole('button', { name: 'Bots', exact: true }).click()
    await client.page.getByRole('button', { name: 'Coordinator', exact: true }).click()
    const resumed = client.page.getByRole('region', { name: 'Coordinator', exact: true })
    await expect(resumed.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    await expect(resumed.locator('[data-native-chat-root="true"]').getByRole('textbox')).toHaveText(
      'A draft to resume later'
    )
    expect(
      (await client.page.evaluate(() => window.api.projectChannels!.read())).channels.map(
        (row) => row.members
      )
    ).toEqual(migrated.channels.map((row) => row.members))
    const recoveredMemory = await client.page.evaluate(
      (id) => window.api.projectChannels!.readMemory(id),
      channel.id
    )
    expect(recoveredMemory.memory.entries).toHaveLength(2)
    expect(recoveredMemory.memory.entries.find((entry) => !entry.archived)?.text).toContain(
      'due Friday'
    )
    expect(
      readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter((frame) => frame.type === 'user')
    ).toHaveLength(1)
  } finally {
    await client.dispose()
  }
})
