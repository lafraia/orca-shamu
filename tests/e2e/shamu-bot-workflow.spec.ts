import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import { z } from 'zod'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED } from './helpers/structured-claude-stub'
import {
  launchPairedElectronClient,
  createRuntimeDesktopPairingOffer
} from './helpers/paired-electron-client'
import type { BotCommand } from '../../src/shared/bot-commands'
import { botRoutinesViewSchema, type BotRoutine } from '../../src/shared/bot-routines'
import { botReferenceContextSchema } from '../../src/main/shamu-bots/bot-journal-reader'
import { createStructuredAgentSessionOperationId } from '../../src/shared/agent-session/lifecycle/structured-agent-session-mutation'

test('bot commands, pins, sections and routines use permanent paired chats and survive restart', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Cold-start paired desktops, exercise real CLI calls and observe the 15-second scheduler, then reopen the client.
  test.setTimeout(180_000)
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
  const cli = async (command: string, input?: BotCommand): Promise<unknown> => {
    const result = await runProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out', 'cli', 'index.js'),
        'bots',
        command,
        '--profile-dir',
        client.userDataDir,
        ...(input ? ['--input', JSON.stringify(input)] : []),
        '--json'
      ],
      env: { ...process.env },
      timeoutMs: 30_000
    })
    expect(result.code, result.stderr).toBe(0)
    return z.object({ ok: z.literal(true), result: z.unknown() }).parse(JSON.parse(result.stdout))
      .result
  }
  const frames = (): unknown[] =>
    existsSync(`${claudeStub.launchLog}.requests.jsonl`)
      ? readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter((frame) => z.object({ type: z.literal('user') }).safeParse(frame).success)
      : []
  try {
    const page = client.page
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    await page.getByRole('dialog').getByLabel('Bot name', { exact: true }).fill('Coordinator')
    await page.getByRole('dialog').getByRole('button', { name: 'Create bot', exact: true }).click()
    const bot = page.getByRole('region', { name: 'Coordinator', exact: true })
    const composer = bot.locator('[data-native-chat-root="true"]').getByRole('textbox')
    await expect(composer).toBeVisible()
    const actor = (await page.evaluate(() => window.api.projectChannels!.read())).channels[0]
    const toolkit = readFileSync(path.join(actor.home!.directory, 'BOT_TOOLS.md'), 'utf8')
    expect(toolkit).toContain('sourceItemId')
    expect(toolkit).toContain('routine.trigger')
    await composer.fill(
      'Create a Researcher bot in Research. Keep my bots organized and create the review routines I request.'
    )
    await composer.press('Enter')
    await expect(bot.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    const context = botReferenceContextSchema.parse(
      await cli('context', { action: 'context', actorId: actor.id, referenceId: 'self' })
    )
    const sourceItemId = context.messages.find(
      (row) => row.role === 'user' && row.text.startsWith('Create a Researcher')
    )!.id
    const create: BotCommand = {
      action: 'create',
      requestId: randomUUID(),
      actorId: actor.id,
      sourceItemId,
      name: 'Researcher',
      instructions: 'Research current primary sources and report in your own chat.',
      section: 'Research'
    }
    const created = await cli('create', create)
    expect(await cli('create', create)).toEqual(created)
    await expect(page.getByRole('button', { name: 'Researcher', exact: true })).toBeVisible()
    const roster = (await page.evaluate(() => window.api.projectChannels!.read())).channels
    expect(roster).toHaveLength(2)
    expect(roster[0].members).toEqual(actor.members)
    expect(roster[1]).toMatchObject({
      name: 'Researcher',
      creation: { actorId: actor.id, sourceItemId },
      home: { ready: true }
    })
    const beforeRoutines = frames().length
    await page.getByRole('button', { name: 'Bot actions: Researcher', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Pin bot', exact: true }).click()
    const pinned = page.getByRole('region', { name: 'Pinned', exact: true })
    await expect(pinned.getByRole('button', { name: 'Researcher', exact: true })).toBeVisible()
    await expect(pinned.locator('.bot-avatar')).toHaveCSS('width', '48px')
    const pinnedFont = await pinned
      .getByText('Researcher', { exact: true })
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    const regularFont = await page
      .getByRole('button', { name: 'Coordinator', exact: true })
      .getByText('Coordinator', { exact: true })
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    expect(pinnedFont).toBeGreaterThan(regularFont)
    await page.getByRole('button', { name: 'Bot actions: Researcher', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Unpin bot', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Move to section', exact: true })).toHaveCount(
      0
    )
    await page.keyboard.press('Escape')
    await pinned.getByRole('button', { name: 'Researcher', exact: true }).click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Unpin bot', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Move to section', exact: true })).toHaveCount(
      0
    )
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Bot actions: Coordinator', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Move to section', exact: true }).hover()
    await page.getByRole('menuitem', { name: 'New section…', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Section name', { exact: true }).fill('Operations')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create section', exact: true })
      .click()
    await expect(
      page
        .getByRole('region', { name: 'Operations', exact: true })
        .getByRole('button', { name: 'Coordinator', exact: true })
    ).toBeVisible()
    await bot.getByRole('button', { name: 'Routines', exact: true }).click()
    const routines = page.getByRole('dialog', { name: 'Coordinator routines', exact: true })
    await expect(routines.getByText('No routines yet', { exact: true })).toBeVisible()
    await routines.getByRole('button', { name: 'Add routine', exact: true }).click()
    await routines.getByLabel('Routine name', { exact: true }).fill('Morning review')
    await routines
      .getByLabel('Routine instructions', { exact: true })
      .fill('Review current project sources and report here.')
    await routines.getByLabel('Time zone', { exact: true }).fill('America/New_York')
    await routines.getByRole('button', { name: 'Save routine', exact: true }).click()
    await expect(
      routines.getByRole('heading', { name: 'Morning review', exact: true })
    ).toBeVisible()
    expect(frames()).toHaveLength(beforeRoutines)
    await routines.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(routines.getByText('Paused', { exact: true })).toBeVisible()
    await routines.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(routines.getByText('Active', { exact: true })).toBeVisible()
    await expect(routines).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath('bot-routines-light.png') })
    await routines.getByRole('button', { name: 'Run now', exact: true }).click()
    // The service reconciles native outcomes on its next 15-second local scheduler tick.
    await expect
      .poll(
        async () =>
          botRoutinesViewSchema.parse(
            await cli('routines', { action: 'routine.list', botId: actor.id })
          ).runs[0]?.state,
        { timeout: 45_000 }
      )
      .toBe('completed')
    await routines.getByRole('button', { name: 'Reload routines', exact: true }).click()
    await expect(routines.getByText('completed', { exact: true })).toBeVisible()
    await routines.getByRole('button', { name: 'Open bot chat', exact: true }).click()
    await expect(bot).toContainText('Run your saved routine')
    const view = botRoutinesViewSchema.parse(
      await cli('routines', { action: 'routine.list', botId: actor.id })
    )
    const event: BotRoutine = {
      id: randomUUID(),
      botId: actor.id,
      name: 'Release event',
      prompt: 'Review the release event and report in this bot chat.',
      schedule: { kind: 'event', key: 'release.ready' },
      enabled: true,
      archived: false,
      nextRunAt: null,
      graceMinutes: 60,
      createdAt: 0,
      updatedAt: 0
    }
    await cli('routines', {
      action: 'routine.save',
      routine: event,
      revision: view.revision,
      actorId: actor.id,
      sourceItemId
    })
    const trigger: BotCommand = {
      action: 'routine.trigger',
      key: 'release.ready',
      eventId: createStructuredAgentSessionOperationId(randomUUID),
      text: 'Release 42 is ready for review.'
    }
    const firstTrigger = z
      .array(z.object({ id: z.string(), operationId: z.string() }))
      .parse(await cli('routines', trigger))
    expect(
      z
        .array(z.object({ id: z.string(), operationId: z.string() }))
        .parse(await cli('routines', trigger))
    ).toEqual(firstTrigger)
    await expect(bot).toContainText('Release 42 is ready for review.')
    await expect
      .poll(
        async () =>
          botRoutinesViewSchema
            .parse(await cli('routines', { action: 'routine.list', botId: actor.id }))
            .runs.filter((run) => run.state === 'completed').length,
        { timeout: 45_000 }
      )
      .toBe(2)
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await bot.getByRole('button', { name: 'Routines', exact: true }).click()
    await expect(
      routines.getByRole('heading', { name: 'Release event', exact: true })
    ).toBeVisible()
    await expect(routines).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath('bot-routines-dark.png') })
    await routines.getByRole('button', { name: 'Close', exact: true }).click()
    const persisted = (await page.evaluate(() => window.api.projectChannels!.read())).channels
    const profile = client.userDataDir
    const environmentId = client.environmentId
    const frameCount = frames().length
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
    await expect(
      client.page
        .getByRole('region', { name: 'Pinned', exact: true })
        .getByRole('button', { name: 'Researcher', exact: true })
    ).toBeVisible()
    await expect(
      client.page
        .getByRole('region', { name: 'Operations', exact: true })
        .getByRole('button', { name: 'Coordinator', exact: true })
    ).toBeVisible()
    expect((await client.page.evaluate(() => window.api.projectChannels!.read())).channels).toEqual(
      persisted
    )
    expect(
      botRoutinesViewSchema.parse(
        await cli('routines', { action: 'routine.list', botId: actor.id })
      ).runs
    ).toHaveLength(2)
    expect(frames()).toHaveLength(frameCount)
  } finally {
    await client.dispose()
  }
})
