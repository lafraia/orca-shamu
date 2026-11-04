import { claudePromptUuidForSubmission } from '../../src/main/claude/structured/claude-structured-session-id'
import { agentJournalSubmissionKey } from '../../src/shared/agent-session/journal/agent-session-journal-item-key'
import path from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { createChatOnHost, SUPPORTED } from './helpers/structured-claude-stub'
import {
  launchPairedElectronClient,
  createRuntimeDesktopPairingOffer
} from './helpers/paired-electron-client'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../src/shared/constants'

test('mentions a bot from a floating chat, keeps its origin, and anchors the picker while moving', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Cold-start two paired desktops, then reload and recover both persisted conversations.
  test.setTimeout(120_000)
  await waitForSessionReady(primary)
  const workspaceId = await waitForActiveWorktree(primary)
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
  const sourceSession = await createChatOnHost(primary, FLOATING_TERMINAL_WORKTREE_ID)
  const offer = await createRuntimeDesktopPairingOffer(primary)
  const client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
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
  try {
    const page = client.page
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    await page.getByRole('dialog').getByLabel('Bot name', { exact: true }).fill('CEO')
    await page.getByRole('dialog').getByRole('button', { name: 'Create bot', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'CEO', exact: true }).getByRole('textbox')
    ).toBeVisible()
    const snapshot = await page.evaluate(() => window.api.projectChannels!.read())
    const bot = snapshot.channels[0]
    const activateSource = async () => {
      await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(
            (sessionId) =>
              window
                .__store!.getState()
                .unifiedTabsByWorktree['global-floating-terminal']?.some(
                  (row) => row.entityId === sessionId
                ) ?? false,
            sourceSession
          )
        )
        .toBe(true)
      await page.evaluate(
        ({ sourceSession, workspaceId }) => {
          const state = window.__store!.getState()
          state.setActiveWorktree(workspaceId)
          const tab = state.unifiedTabsByWorktree['global-floating-terminal'].find(
            (row) => row.entityId === sourceSession
          )!
          state.activateTab(tab.id, { worktreeId: 'global-floating-terminal' })
          if (!state.floatingWorkspacePanelOpen) {
            window.dispatchEvent(new Event('orca-toggle-floating-terminal'))
          }
        },
        { sourceSession, workspaceId }
      )
    }
    await activateSource()
    const panel = page.locator('[data-floating-terminal-panel][aria-hidden="false"]')
    const composer = panel.locator('[data-native-chat-root="true"]').getByRole('textbox')
    await expect(composer).toBeVisible()
    await composer.fill('Please @CE')
    const picker = page.locator('[role="listbox"][data-focus-behavior="composer-suggestions"]')
    const choice = picker.getByRole('option', { name: 'CEO Replies in its own chat', exact: true })
    await expect(choice).toBeVisible()
    const anchored = async () => {
      const field = await composer.boundingBox()
      const menu = await picker.boundingBox()
      return Boolean(
        field &&
        menu &&
        menu.height > 0 &&
        menu.y + menu.height <= field.y &&
        menu.x >= 0 &&
        menu.x + menu.width <= (page.viewportSize()?.width ?? 1280) &&
        menu.y >= 0
      )
    }
    await expect.poll(anchored).toBe(true)
    await panel.screenshot({ path: testInfo.outputPath('bot-mention-picker.png') })
    // A transformed ancestor establishes a containing block for fixed descendants.
    await panel.evaluate((node) => {
      node.style.transform = 'translate(13px, -17px)'
    })
    await expect.poll(anchored).toBe(true)
    await page.setViewportSize({ width: 1000, height: 760 })
    await expect.poll(anchored).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(anchored).toBe(true)
    await choice.click()
    await expect(composer.locator('[data-native-chat-bot-reference]')).toHaveAttribute(
      'data-native-chat-bot-reference',
      bot.id
    )
    await page.reload()
    await activateSource()
    await expect(composer.locator('[data-native-chat-bot-reference]')).toHaveAttribute(
      'data-native-chat-bot-reference',
      bot.id
    )
    await composer.press('End')
    await composer.pressSequentially('review this plan')
    await composer.press('Enter')
    const frames = () =>
      existsSync(`${claudeStub.launchLog}.requests.jsonl`)
        ? readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : []
    const savedMention = () => {
      const directory = [
        client.userDataDir,
        path.join(client.userDataDir, 'profiles', 'local-default')
      ]
        .map((root) => path.join(root, 'bot-mentions'))
        .find((dir) => existsSync(dir))
      const file = directory && readdirSync(directory).find((name) => name.endsWith('.json'))
      return file && directory ? JSON.parse(readFileSync(path.join(directory, file), 'utf8')) : null
    }
    await expect
      .poll(() =>
        ['recorded', 'refused', 'unconfirmed'].includes(savedMention()?.receipts[0].state)
      )
      .toBe(true)
    const delivery = savedMention()
    expect(delivery.receipts[0], JSON.stringify(delivery.receipts[0])).toMatchObject({
      state: 'recorded'
    })
    expect(delivery.request.source.sessionId).toBe(sourceSession)
    expect(delivery.request.text).toContain('review this plan')
    const sentUuid = claudePromptUuidForSubmission(
      bot.members[0].sessionId,
      agentJournalSubmissionKey(delivery.receipts[0].operationId)
    )
    const mentionFrames = () =>
      frames().filter((frame) => frame.type === 'user' && frame.uuid === sentUuid)
    await expect.poll(() => mentionFrames().length).toBe(1)
    await expect(panel.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('orca-toggle-floating-terminal')))
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    const botChat = page.getByRole('region', { name: 'CEO', exact: true })
    await expect(botChat.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    await expect(botChat).toContainText(sourceSession)
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await expect(botChat.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
    expect(mentionFrames()).toHaveLength(1)
    await page.screenshot({ path: testInfo.outputPath('bot-mention-own-chat.png') })
  } finally {
    await client.dispose()
  }
})
