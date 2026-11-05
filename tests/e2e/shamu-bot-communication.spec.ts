import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import { z } from 'zod'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './helpers/paired-electron-client'
import { SUPPORTED } from './helpers/structured-claude-stub'
import type { BotCommand } from '../../src/shared/bot-commands'
import type { ProjectChannel } from '../../src/shared/project-channels'

test('separates bidirectional bot communication, preserves personal messages and shows queued handoffs', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Two paired desktops launch two bot sessions, exchange replies, then exercise a queued turn.
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
  const page = client.page
  const cli = async (command: string, input: BotCommand): Promise<unknown> => {
    const result = await runProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out/cli/index.js'),
        'bots',
        command,
        '--profile-dir',
        client.userDataDir,
        '--input',
        JSON.stringify(input),
        '--json'
      ],
      env: { ...process.env },
      timeoutMs: 30_000
    })
    expect(result.code, result.stderr).toBe(0)
    return z.object({ ok: z.literal(true), result: z.unknown() }).parse(JSON.parse(result.stdout))
      .result
  }
  const frames = () =>
    existsSync(`${claudeStub.launchLog}.requests.jsonl`)
      ? readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter((frame) => frame.type === 'user')
      : []
  const createBot = async (name: string) => {
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    await page.getByRole('dialog').getByLabel('Bot name', { exact: true }).fill(name)
    await page.getByRole('dialog').getByRole('button', { name: 'Create bot', exact: true }).click()
    await expect(page.getByRole('region', { name, exact: true }).getByRole('textbox')).toBeVisible()
    return (await page.evaluate(() => window.api.projectChannels!.read())).channels.find(
      (bot) => bot.name === name
    )!
  }
  const userItem = async (bot: ProjectChannel) => {
    const view = z
      .object({ messages: z.array(z.object({ id: z.string(), role: z.string() })) })
      .parse(await cli('context', { action: 'context', actorId: bot.id, referenceId: 'self' }))
    return view.messages.findLast((message) => message.role === 'user')!.id
  }
  const mention = async (actor: ProjectChannel, recipient: ProjectChannel, text: string) => {
    const source = actor.members.find((member) => member.id === actor.home?.memberId)!
    const request = {
      id: randomUUID(),
      botIds: [recipient.id],
      text,
      source: {
        environmentId: client.environmentId,
        sessionId: source.sessionId,
        label: actor.name
      }
    }
    const receipts = await cli('mention', {
      action: 'mention',
      actorId: actor.id,
      sourceItemId: await userItem(actor),
      request
    })
    expect(receipts).toMatchObject([{ state: 'recorded' }])
  }
  try {
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    const ceo = await createBot('CEO')
    const dev = await createBot('Dev: Vagalume')
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    const ceoChat = page.getByRole('region', { name: 'CEO', exact: true })
    const ceoComposer = ceoChat.getByRole('textbox')
    await ceoComposer.fill('Ask Dev to review the launch plan.')
    await ceoComposer.press('Enter')
    await expect(ceoChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    const imagePath = path.join(ceo.home!.directory, 'launch.png')
    writeFileSync(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        'base64'
      )
    )
    await mention(ceo, dev, `Can you review the launch plan?\n\n![Launch plan](${imagePath})`)
    await expect(ceoChat.locator('[data-bot-communication]')).toHaveCount(1)
    await expect(ceoChat).toContainText('Messaged Dev: Vagalume')
    await page.getByRole('button', { name: 'Dev: Vagalume', exact: true }).click()
    const devChat = page.getByRole('region', { name: 'Dev: Vagalume', exact: true })
    await expect(devChat.locator('[data-bot-communication]')).toHaveCount(1)
    await expect(devChat.locator('[data-bot-communication]')).toContainText('Replied')
    await expect(devChat).not.toContainText('The user mentioned you')
    await expect(devChat.getByText('Stub reply.', { exact: true })).toHaveCount(0)
    const devComposer = devChat.getByRole('textbox')
    await devComposer.fill('Reply to CEO with the review status.')
    await devComposer.press('Enter')
    await expect(devChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await mention(dev, ceo, 'The launch review is ready.')
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    await expect(ceoChat.locator('[data-bot-communication]')).toHaveCount(2)
    await expect(ceoChat.locator('[data-bot-communication]').last()).toContainText('Replied')
    await expect(ceoChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await ceoComposer.fill('My unsent draft stays here')
    const beforeReading = frames().length
    await ceoChat.locator('[data-bot-communication]').first().click()
    const thread = page.locator('[data-bot-communication-thread]')
    await expect(thread).toContainText('Can you review the launch plan?')
    const image = thread.getByRole('img', { name: 'Launch plan', exact: true })
    await expect(image).toBeVisible()
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0
        )
      )
      .toBe(true)
    await expect(thread).toContainText('The launch review is ready.')
    await expect(thread.getByText('Stub reply.', { exact: true })).toHaveCount(2)
    await expect(thread).not.toContainText('Ask Dev to review the launch plan.')
    await expect(thread).not.toContainText('Reply to CEO with the review status.')
    await expect(thread).not.toContainText('Notification reference:')
    await page.screenshot({ path: testInfo.outputPath('bot-communication-light.png') })
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(thread).toHaveCSS('animation-name', 'none')
    await page.screenshot({ path: testInfo.outputPath('bot-communication-dark.png') })
    await page.keyboard.press('Escape')
    await expect(thread).toHaveCount(0)
    await expect(ceoComposer).toContainText('My unsent draft stays here')
    expect(frames()).toHaveLength(beforeReading)
    await page.screenshot({ path: testInfo.outputPath('bot-communication-main.png') })
    await ceoComposer.fill('slow: keep this personal task running')
    await ceoComposer.press('Enter')
    await expect(ceoChat.getByRole('button', { name: 'Stop the agent', exact: true })).toBeVisible()
    await mention(dev, ceo, 'A separate update while CEO is busy.')
    const queue = ceoChat.locator('[data-queued-message-id]')
    await expect(queue).toHaveCount(1)
    await expect(queue).toContainText('Queued')
    await expect(queue).not.toContainText('The user mentioned you')
    await queue.locator('[data-bot-communication]').click()
    await expect(thread).toContainText('A separate update while CEO is busy.')
    await page.keyboard.press('Escape')
    await queue.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(queue).toHaveCount(0)
  } finally {
    await client.dispose()
  }
})
