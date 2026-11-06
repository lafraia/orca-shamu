import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import { z } from 'zod'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { SUPPORTED } from './helpers/structured-claude-stub'
import { createShamuBot, launchShamuBots } from './helpers/paired-shamu-bots'

test('external CLI prompts keep origin cards, replies, idempotency and the native busy queue', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Paired desktops run the actual CLI, submit prompts and restore the native queue.
  test.setTimeout(120_000)
  const client = await launchShamuBots(primary, claudeStub.command, testInfo)
  const cli = async (args: string[]) => {
    const result = await runProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out/cli/index.js'),
        'bots',
        ...args,
        '--profile-dir',
        client.userDataDir,
        '--json'
      ],
      env: { ...process.env },
      timeoutMs: 30_000
    })
    expect(result.code, result.stderr).toBe(0)
    return z
      .object({
        ok: z.literal(true),
        result: z.object({
          requestId: z.string(),
          operationId: z.string(),
          state: z.string(),
          delivery: z.string(),
          response: z.string().nullable()
        })
      })
      .parse(JSON.parse(result.stdout)).result
  }
  try {
    const page = client.page
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await createShamuBot(page, 'Researcher')
    const chat = page.getByRole('region', { name: 'Researcher', exact: true })
    const composer = chat.getByRole('textbox')
    await composer.fill('Keep my unfinished draft')
    const file = testInfo.outputPath('external-prompt.txt')
    await writeFile(file, 'Inspect the synthetic project.\nReturn a summary for Grokbot.')
    const id = 'a7554749-829c-4d45-a6c1-946e7aecc075'
    const args = [
      'send',
      '--bot',
      'Researcher',
      '--request-id',
      id,
      '--sender',
      'Grokbot',
      '--text-file',
      file
    ]
    const sent = await cli(args)
    const card = chat.locator(`[data-bot-cli-request="${id}"]`)
    await expect(card).toContainText(
      'Inspect the synthetic project.\nReturn a summary for Grokbot.'
    )
    await expect(chat.getByText('Stub reply.', { exact: true })).toBeVisible()
    await expect(composer).toHaveText('Keep my unfinished draft')
    let response: Awaited<ReturnType<typeof cli>> | undefined
    await expect
      .poll(async () => {
        response = await cli(['result', '--request-id', id])
        return response.state
      })
      .toBe('completed')
    expect(response?.response).toBe('Stub reply.')
    expect((await cli(args)).operationId).toBe(sent.operationId)
    await expect(card).toHaveCount(1)
    await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await composer.fill('slow work before another external prompt')
    await composer.press('Enter')
    await expect(chat.getByRole('button', { name: 'Stop the agent', exact: true })).toBeVisible()
    const queuedId = '0155d2b2-a0df-4fca-8c4a-86fc935b0151'
    const queued = await cli([
      'send',
      '--bot',
      'Researcher',
      '--request-id',
      queuedId,
      '--sender',
      'Automation',
      '--text',
      'Run this after the current work finishes.'
    ])
    expect(queued.delivery).toBe('queued')
    await expect(chat.locator(`[data-bot-cli-request="${queuedId}"]`)).toContainText(
      'Run this after the current work finishes.'
    )
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page
      .getByRole('navigation', { name: 'Bots', exact: true })
      .getByRole('button', { name: 'Researcher', exact: true })
      .click()
    await expect(chat.locator(`[data-bot-cli-request="${id}"]`)).toHaveCount(1)
    await expect(chat.locator(`[data-bot-cli-request="${queuedId}"]`)).toHaveCount(1)
    await page.screenshot({
      path: testInfo.outputPath('received-from-cli-dark.png'),
      animations: 'disabled'
    })
  } finally {
    await client.dispose()
  }
})
