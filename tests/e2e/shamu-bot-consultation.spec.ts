import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import { z } from 'zod'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { createShamuBot, launchShamuBots } from './helpers/paired-shamu-bots'
import { SUPPORTED } from './helpers/structured-claude-stub'
import type { BotCommand } from '../../src/shared/bot-commands'

test('the coordinator owns a peer consultation instead of forwarding the user mention', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  const client = await launchShamuBots(primary, claudeStub.command, testInfo)
  try {
    const page = client.page
    await client.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 900)
    })
    await page.evaluate(() => window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' }))
    const cli = async (command: string, input: BotCommand) => {
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
        timeoutMs: 40_000
      })
      expect(result.code, result.stderr).toBe(0)
      return z.object({ ok: z.literal(true), result: z.unknown() }).parse(JSON.parse(result.stdout))
        .result
    }
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await createShamuBot(page, 'CEO')
    await createShamuBot(page, 'Specialist')
    const bots = (await page.evaluate(() => window.api.projectChannels!.read())).channels
    const ceo = bots.find((bot) => bot.name === 'CEO')!
    const specialist = bots.find((bot) => bot.name === 'Specialist')!
    await page
      .getByRole('navigation', { name: 'Bots', exact: true })
      .getByRole('button', { name: 'CEO', exact: true })
      .click()
    const chat = page.getByRole('region', { name: 'CEO', exact: true })
    const composer = chat.getByRole('textbox')
    await composer.fill('Ask @Special')
    await page
      .getByRole('option', { name: 'Specialist Replies in its own chat', exact: true })
      .click()
    await composer.press('End')
    await composer.pressSequentially(' when the app will launch.')
    await composer.press('Enter')
    await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(1)

    const context = z.object({
      messages: z.array(z.object({ id: z.string(), role: z.string(), text: z.string() }))
    })
    const source = context.parse(
      await cli('context', { action: 'context', actorId: ceo.id, referenceId: 'self' })
    )
    const user = source.messages.findLast((message) => message.role === 'user')!
    expect(
      context.parse(
        await cli('context', { action: 'context', actorId: specialist.id, referenceId: 'self' })
      ).messages
    ).toEqual([])

    const request = {
      action: 'ask' as const,
      requestId: randomUUID(),
      actorId: ceo.id,
      sourceItemId: user.id,
      botId: specialist.id,
      text: 'I need a confirmed launch forecast. What date and remaining blockers can you verify?'
    }
    const accepted = await cli('ask', request)
    expect(await cli('ask', request)).toEqual(accepted)
    const answer = z.object({ state: z.string(), response: z.string().nullable() }).parse(
      await cli('ask-result', {
        action: 'ask.result',
        actorId: ceo.id,
        requestId: request.requestId,
        waitSeconds: 30
      })
    )
    expect(answer).toEqual({ state: 'completed', response: 'Stub reply.' })
    const summary = chat.locator('[data-bot-communication-summary]')
    await expect(summary.locator('[data-communication-state="replied"]')).toHaveCount(1)
    await expect(summary).toContainText('Specialist')
    await expect(summary.locator('xpath=ancestor::*[@data-native-chat-message-id]')).toHaveCount(1)
    await expect(chat.locator('[data-bot-communication]')).toHaveCount(1)
    await chat.locator('[data-bot-communication]').click()
    const thread = page.locator('[data-bot-communication-thread]')
    await expect(thread).toContainText(
      'I need a confirmed launch forecast. What date and remaining blockers can you verify?'
    )
    await expect(thread.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await expect(thread).not.toContainText(user.text)
    await page.screenshot({
      path: testInfo.outputPath('bot-consultation-first-person.png'),
      animations: 'disabled'
    })
  } finally {
    await client.dispose()
  }
})
