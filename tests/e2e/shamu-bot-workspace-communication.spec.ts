import path from 'node:path'
import { readFileSync } from 'node:fs'
import { runProcess } from '@orca/process-host'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { createChatOnHost, SUPPORTED } from './helpers/structured-claude-stub'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './helpers/paired-electron-client'

test('separates native bot/workspace messages, keeps bot identity and links both original chats', async ({
  orcaPage: primary,
  electronApp,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Two paired desktops launch native chats and exchange mail through the compiled CLI.
  test.setTimeout(120_000)
  await waitForSessionReady(primary)
  const worktreeId = await waitForActiveWorktree(primary)
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
  const workspaceSession = await createChatOnHost(primary, worktreeId)
  const profile = await electronApp.evaluate(({ app }) => app.getPath('userData'))
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
  const send = async (from: string, to: string, body: string) => {
    const env = { ...process.env, ORCA_USER_DATA_PATH: profile, ORCA_AGENT_SESSION_ID: from }
    delete env.ORCA_PAIRING_CODE
    delete env.ORCA_REMOTE_PAIRING
    delete env.ORCA_ENVIRONMENT
    const result = await runProcess({
      program: process.execPath,
      args: [
        path.join(process.cwd(), 'out/cli/index.js'),
        'orchestration',
        'send',
        '--from',
        `orca_session_id:${from}`,
        '--to',
        `orca_session_id:${to}`,
        '--subject',
        'Launch review',
        '--body',
        body,
        '--json'
      ],
      env,
      timeoutMs: 30_000
    })
    expect(result.code, result.stderr + result.stdout).toBe(0)
  }
  const frameCount = () =>
    readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((frame) => frame.type === 'user').length
  try {
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    await page.getByRole('dialog').getByLabel('Bot name', { exact: true }).fill('CEO')
    await page.getByRole('dialog').getByRole('button', { name: 'Create bot', exact: true }).click()
    const botChat = page.getByRole('region', { name: 'CEO', exact: true })
    const botComposer = botChat.getByRole('textbox')
    await botComposer.fill('Help me plan the launch.')
    await botComposer.press('Enter')
    await expect(botChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    const bot = (await page.evaluate(() => window.api.projectChannels!.read())).channels[0]
    const botSession = bot.members.find((member) => member.id === bot.home?.memberId)!.sessionId
    const activateWorkspace = async () => {
      await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(
            ({ worktreeId, workspaceSession }) =>
              window
                .__store!.getState()
                .unifiedTabsByWorktree[worktreeId]?.some(
                  (tab) => tab.entityId === workspaceSession
                ) ?? false,
            { worktreeId, workspaceSession }
          )
        )
        .toBe(true)
      await page.evaluate(
        ({ worktreeId, workspaceSession }) => {
          const state = window.__store!.getState()
          state.setActiveWorktree(worktreeId)
          const tab = state.unifiedTabsByWorktree[worktreeId].find(
            (row) => row.entityId === workspaceSession
          )!
          state.activateTab(tab.id, { worktreeId })
        },
        { worktreeId, workspaceSession }
      )
    }
    await activateWorkspace()
    const workspaceChat = page
      .locator('[data-native-chat-root="true"]')
      .filter({ has: page.getByRole('textbox') })
      .last()
    const composer = workspaceChat.getByRole('textbox')
    await expect(composer).toBeVisible()
    await composer.fill('This is my private workspace question.')
    await composer.press('Enter')
    await expect(workspaceChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await send(botSession, workspaceSession, 'The CEO asks the workspace to review the launch.')
    const row = workspaceChat.locator('[data-bot-communication]')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Message from bot CEO')
    await expect(row).toContainText('Replied')
    await expect(workspaceChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await expect(workspaceChat).not.toContainText('The CEO asks the workspace')
    await composer.fill('Keep this unsent workspace draft')
    const beforeReading = frameCount()
    await row.click()
    const thread = page.locator('[data-bot-communication-thread]')
    await expect(thread).toContainText('The CEO asks the workspace to review the launch.')
    await expect(thread.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await expect(
      thread
        .locator('.native-chat-markdown')
        .filter({ hasText: 'This is my private workspace question.' })
    ).toHaveCount(0)
    await expect(thread).not.toContainText('orca orchestration reply')
    await thread.getByRole('button', { name: 'CEO', exact: true }).click()
    await expect(thread).toHaveCount(0)
    await expect(botComposer).toBeVisible()
    expect(frameCount()).toBe(beforeReading)
    await send(workspaceSession, botSession, 'The workspace has completed the requested review.')
    await expect(botChat.locator('[data-bot-communication]')).toHaveCount(1)
    await expect(botChat.locator('[data-bot-communication]')).toContainText('Replied')
    await expect(botChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await botChat.locator('[data-bot-communication]').click()
    await expect(thread).toContainText('The workspace has completed the requested review.')
    await expect(thread).toContainText('The CEO asks the workspace to review the launch.')
    await expect(thread.getByText('Stub reply.', { exact: true })).toHaveCount(2)
    await expect(thread).not.toContainText('Help me plan the launch.')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(thread).toHaveCSS('animation-name', 'none')
    await page.screenshot({ path: testInfo.outputPath('bot-workspace-communication.png') })
    const participants = thread.getByRole('heading').getByRole('button')
    await participants.first().click()
    await expect(thread).toHaveCount(0)
    await expect(composer).toContainText('Keep this unsent workspace draft')
    await composer.fill('slow: keep this personal workspace task running')
    await composer.press('Enter')
    await expect(
      workspaceChat.getByRole('button', { name: 'Stop the agent', exact: true })
    ).toBeVisible()
    await send(botSession, workspaceSession, 'A queued bot update to the busy workspace.')
    const queue = workspaceChat.locator('[data-queued-message-id]')
    await expect(queue).toHaveCount(1)
    await expect(queue).toContainText('Message from bot CEO')
    await expect(queue).not.toContainText('A queued bot update')
    await queue.locator('[data-bot-communication]').click()
    await expect(thread).toContainText('A queued bot update to the busy workspace.')
    await page.keyboard.press('Escape')
    await queue.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(queue).toHaveCount(0)
  } finally {
    await client.dispose()
  }
})
