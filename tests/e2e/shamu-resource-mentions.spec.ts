import { existsSync, readFileSync } from 'node:fs'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { createChatOnHost, SUPPORTED } from './helpers/structured-claude-stub'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient
} from './helpers/paired-electron-client'

test('mentions workspaces, projects and issues without preselecting or notifying CEO', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Two isolated desktops pair, persist a rich draft and send native provider turns.
  test.setTimeout(120_000)
  await waitForSessionReady(primary)
  const worktreeId = await waitForActiveWorktree(primary)
  const owner = await primary.evaluate(
    async ({ command, workspaceDir, worktreeId }) => {
      const state = window.__store!.getState()
      const owned = Object.values(state.worktreesByRepo)
        .flat()
        .find((row) => row.id === worktreeId)!
      await state.updateRepo(owned.repoId, { displayName: 'Launch project' }, { hostId: 'local' })
      await state.updateWorktreeMeta(
        worktreeId,
        {
          displayName: 'Launch workspace',
          linkedItems: [
            {
              provider: 'github',
              type: 'issue',
              number: 42,
              title: 'Launch issue',
              url: 'https://github.com/example/launch/issues/42'
            }
          ]
        },
        { executionHostId: 'local' }
      )
      await state.updateSettings({
        nativeChatProviders: { claude: true },
        defaultTuiAgent: 'claude',
        workspaceDir,
        agentCmdOverrides: { claude: command }
      })
      return { path: owned.path }
    },
    {
      command: buildFakeAgentCommandOverride(claudeStub.command),
      workspaceDir: testInfo.outputPath('workspaces'),
      worktreeId
    }
  )
  const sessionId = await createChatOnHost(primary, worktreeId)
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
  const frames = () =>
    existsSync(`${claudeStub.launchLog}.requests.jsonl`)
      ? readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter((frame) => frame.type === 'user')
      : []
  const activateWorkspace = async () => {
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          ({ worktreeId, sessionId }) =>
            window
              .__store!.getState()
              .unifiedTabsByWorktree[worktreeId]?.some((row) => row.entityId === sessionId) ??
            false,
          { worktreeId, sessionId }
        )
      )
      .toBe(true)
    await page.evaluate(
      ({ worktreeId, sessionId }) => {
        const state = window.__store!.getState()
        state.setActiveWorktree(worktreeId)
        const tab = state.unifiedTabsByWorktree[worktreeId].find(
          (row) => row.entityId === sessionId
        )!
        state.activateTab(tab.id, { worktreeId })
      },
      { worktreeId, sessionId }
    )
  }
  try {
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    await page.getByRole('dialog').getByLabel('Bot name', { exact: true }).fill('CEO')
    await page.getByRole('dialog').getByRole('button', { name: 'Create bot', exact: true }).click()
    const botChat = page.getByRole('region', { name: 'CEO', exact: true })
    await expect(botChat.getByRole('textbox')).toBeVisible()
    await activateWorkspace()
    const chat = page
      .locator('[data-native-chat-root="true"]')
      .filter({ has: page.getByRole('textbox') })
      .last()
    const composer = chat.getByRole('textbox')
    const menu = page.locator('[role="listbox"][data-focus-behavior="composer-suggestions"]')
    await composer.fill('Review @')
    await expect(
      menu.getByRole('option', { name: 'CEO Replies in its own chat', exact: true })
    ).toBeVisible()
    await expect(menu.getByRole('option', { selected: true })).toHaveCount(0)
    await expect(composer).not.toHaveAttribute('aria-activedescendant')
    await page.screenshot({ path: testInfo.outputPath('resource-mention-menu.png') })
    await composer.press('Enter')
    await expect(composer).toHaveText('Review @')
    expect(frames()).toHaveLength(0)
    const ceo = menu.getByRole('option', { name: 'CEO Replies in its own chat', exact: true })
    await ceo.hover()
    await expect(menu.getByRole('option', { selected: true })).toHaveCount(1)
    await composer.press('ArrowDown')
    await expect(menu.getByRole('option', { selected: true })).toHaveCount(1)
    await expect(ceo).toHaveAttribute('aria-selected', 'false')
    await expect(ceo).not.toHaveClass(/\bbg-accent\b/)
    await menu
      .getByRole('group', { name: 'Workspaces', exact: true })
      .getByRole('option', { name: /Launch workspace/ })
      .click()
    await expect(composer.locator('[data-native-chat-resource-reference="workspace"]')).toHaveCount(
      1
    )
    await composer.press('End')
    await composer.pressSequentially(' and @')
    await menu
      .getByRole('group', { name: 'Projects', exact: true })
      .getByRole('option', { name: /Launch project/ })
      .click()
    await composer.press('End')
    await composer.pressSequentially(' and @')
    await menu
      .getByRole('group', { name: 'Issues', exact: true })
      .getByRole('option', { name: /#42 Launch issue/ })
      .click()
    await expect(composer.locator('[data-native-chat-resource-reference]')).toHaveCount(3)
    await expect(composer.locator('[data-native-chat-bot-reference]')).toHaveCount(0)
    await page.reload()
    await activateWorkspace()
    await expect(composer.locator('[data-native-chat-resource-reference]')).toHaveCount(3)
    await composer.press('End')
    await composer.pressSequentially(' Please check these references.')
    await composer.press('Enter')
    await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await expect(
      chat.getByRole('button', { name: 'Open workspace: Launch workspace', exact: true })
    ).toBeVisible()
    await expect(
      chat.getByRole('button', { name: 'Open project: Launch project', exact: true })
    ).toBeVisible()
    await expect(
      chat.getByRole('button', { name: 'Open issue: #42 Launch issue', exact: true })
    ).toBeVisible()
    await expect(chat).not.toContainText('orca-shamu-reference')
    expect(frames()).toHaveLength(1)
    const history = await primary.evaluate(
      (sessionId) =>
        window.api.runtime.call({
          method: 'agentSession.history',
          params: { sessionId, direction: 'tail' }
        }),
      sessionId
    )
    expect(history).toMatchObject({ ok: true })
    expect(JSON.stringify(history)).toContain(owner.path)
    expect(JSON.stringify(history)).toContain('https://github.com/example/launch/issues/42')
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    const botComposer = botChat.getByRole('textbox')
    await botComposer.fill('Look at @')
    await expect(menu.getByRole('option', { selected: true })).toHaveCount(0)
    await menu
      .getByRole('group', { name: 'Workspaces', exact: true })
      .getByRole('option', { name: /Launch workspace/ })
      .click()
    await botComposer.press('End')
    await botComposer.press('Enter')
    const link = botChat.getByRole('button', {
      name: 'Open workspace: Launch workspace',
      exact: true
    })
    await expect(link).toBeVisible()
    await expect(botChat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await botComposer.fill('Keep this bot draft')
    await page.screenshot({ path: testInfo.outputPath('resource-mention-transcript.png') })
    const before = frames().length
    await link.click()
    await expect(composer).toBeVisible()
    expect(frames()).toHaveLength(before)
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'CEO', exact: true }).click()
    await expect(botComposer).toHaveText('Keep this bot draft')
  } finally {
    await client.dispose()
  }
})
