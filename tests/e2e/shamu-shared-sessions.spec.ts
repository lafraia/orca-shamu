import { existsSync, readFileSync } from 'node:fs'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { createChatOnHost, SUPPORTED } from './helpers/structured-claude-stub'
import { launchPairedElectronClient } from './helpers/paired-electron-client'
import { claudePromptUuidForSubmission } from '../../src/main/claude/structured/claude-structured-session-id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../src/shared/constants'
import { agentJournalSubmissionKey } from '../../src/shared/agent-session/journal/agent-session-journal-item-key'

test.describe('Shamu shares the primary Orca sessions', () => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  for (const owner of ['worktree', 'folder', 'floating'] as const) {
    test(`shares the same ${owner} session and Stop control with both apps open`, async ({
      orcaPage: primary,
      claudeStub,
      seededRepoPath
    }, testInfo) => {
      // Cold-start both desktops, pair them and wait for provider cancellation and journal recovery.
      test.setTimeout(120_000)
      await waitForSessionReady(primary)
      let workspaceId = await waitForActiveWorktree(primary)
      const command = buildFakeAgentCommandOverride(claudeStub.command)
      await primary.evaluate(async (command) => {
        await window.__store!.getState().updateSettings({
          nativeChatProviders: { claude: true },
          defaultTuiAgent: 'claude',
          agentCmdOverrides: { claude: command }
        })
      }, command)
      if (owner === 'folder') {
        workspaceId = await primary.evaluate(async (folderPath) => {
          const state = window.__store!.getState()
          const group = await state.createProjectGroup('Shamu project', 'local')
          if (!group) {
            throw new Error('Could not create fixture group')
          }
          const folder = await state.createFolderWorkspace(
            { projectGroupId: group.id, name: 'Shared coordinator', folderPath },
            { runtimeEnvironmentId: null }
          )
          if (!folder) {
            throw new Error('Could not create fixture folder')
          }
          const id = `folder:${folder.id}`
          state.setActiveWorktree(id)
          return id
        }, seededRepoPath)
      }
      if (owner === 'floating') {
        workspaceId = FLOATING_TERMINAL_WORKTREE_ID
      }
      const sessionId = await createChatOnHost(primary, workspaceId)
      await expect
        .poll(() =>
          primary.evaluate(
            ({ workspaceId, sessionId }) =>
              window
                .__store!.getState()
                .unifiedTabsByWorktree[workspaceId]?.some((row) => row.entityId === sessionId) ??
              false,
            { workspaceId, sessionId }
          )
        )
        .toBe(true)
      const primaryTab = await primary.evaluate(
        ({ workspaceId, sessionId }) => {
          const state = window.__store!.getState()
          const tab = state.unifiedTabsByWorktree[workspaceId].find(
            (row) => row.entityId === sessionId
          )
          if (!tab) {
            throw new Error('Primary session did not publish its tab')
          }
          state.setTabCustomLabel(tab.id, 'Shared coordinator')
          state.activateTab(tab.id, { worktreeId: workspaceId })
          return tab.id
        },
        { workspaceId, sessionId }
      )
      const offer = await primary.evaluate(async () => {
        const offer = await window.api.mobile.getRuntimePairingUrl({
          address: '127.0.0.1',
          reach: 'this-computer',
          rotate: true
        })
        if (!offer.available) {
          throw new Error('Primary pairing is unavailable')
        }
        return { pairingUrl: offer.pairingUrl }
      })
      const client = await launchPairedElectronClient(offer, testInfo, 'Orca principal', {
        extraEnv: { ORCA_SHAMU_CLIENT: '1' },
        connect: async (page) => {
          await page.setViewportSize({ width: 1280, height: 900 })
          await page.evaluate(async (command) => {
            await window
              .__store!.getState()
              .updateSettings({ agentCmdOverrides: { claude: command } })
          }, command)
          await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toBeVisible()
          await page.getByLabel('Primary Orca access link', { exact: true }).fill(offer.pairingUrl)
          await page.getByRole('button', { name: 'Connect to primary Orca', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toHaveCount(
            0
          )
          const connection = await page.evaluate(() => window.api.shamuClient!.read())
          if (!connection.environmentId) {
            throw new Error('Shamu did not retain its connection')
          }
          return connection.environmentId
        }
      })
      let disposed = false
      try {
        await expect
          .poll(() =>
            client.page.evaluate((id) => {
              const state = window.__store!.getState()
              if (id === 'global-floating-terminal') {
                return Boolean(state.unifiedTabsByWorktree[id]?.length)
              }
              return id.startsWith('folder:')
                ? state.folderWorkspaces.some((row) => `folder:${row.id}` === id)
                : state.allWorktrees().some((row) => row.id === id)
            }, workspaceId)
          )
          .toBe(true)
        await client.page.evaluate(
          (id) => window.__store!.getState().setActiveWorktree(id),
          workspaceId
        )
        await expect
          .poll(() =>
            client.page.evaluate(
              ({ workspaceId, sessionId }) =>
                window
                  .__store!.getState()
                  .unifiedTabsByWorktree[workspaceId]?.some((tab) => tab.entityId === sessionId) ??
                false,
              { workspaceId, sessionId }
            )
          )
          .toBe(true)
        const tabId = await client.page.evaluate(
          ({ workspaceId, sessionId }) => {
            const state = window.__store!.getState()
            const tab = state.unifiedTabsByWorktree[workspaceId].find(
              (row) => row.entityId === sessionId
            )!
            state.activateTab(tab.id, { worktreeId: workspaceId })
            return tab.id
          },
          { workspaceId, sessionId }
        )
        if (owner === 'floating') {
          await client.page.evaluate(() => {
            if (!window.__store!.getState().floatingWorkspacePanelOpen) {
              window.dispatchEvent(new Event('orca-toggle-floating-terminal'))
            }
          })
        }
        await client.page
          .locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
          .click({ button: 'right' })
        await client.page.getByRole('menuitem', { name: 'Create bot from chat…' }).click()
        await client.page.getByLabel('Bot name', { exact: true }).fill('Shared project')
        await client.page.getByRole('button', { name: 'Create bot', exact: true }).click()
        if (owner === 'floating') {
          await client.page.evaluate(() => {
            if (window.__store!.getState().floatingWorkspacePanelOpen) {
              window.dispatchEvent(new Event('orca-toggle-floating-terminal'))
            }
          })
        }
        await expect(client.page.locator('[data-project-agent]')).toContainText('Ready')
        const message = client.page.getByRole('textbox', { name: 'Message bot', exact: true })
        await message.fill('Hello from Shamu')
        await message.press('Enter')
        await expect(
          client.page.getByRole('log').getByText('Stub reply.', { exact: true })
        ).toHaveCount(1)
        await primary.evaluate(
          ({ workspaceId, primaryTab }) =>
            window.__store!.getState().activateTab(primaryTab, { worktreeId: workspaceId }),
          { workspaceId, primaryTab }
        )
        if (owner === 'floating') {
          await primary.evaluate(() => {
            if (!window.__store!.getState().floatingWorkspacePanelOpen) {
              window.dispatchEvent(new Event('orca-toggle-floating-terminal'))
            }
          })
        }
        await expect(primary.locator('body')).toContainText('Hello from Shamu')
        await expect(primary.getByText('Stub reply.', { exact: true }).first()).toBeVisible()
        const project = await client.page.evaluate(() => window.api.projectChannels!.read())
        expect(project.channels[0].members[0]).toMatchObject({
          sessionId,
          target: { kind: 'environment', environmentId: client.environmentId }
        })
        await message.fill('A slow request for the Stop control')
        await message.press('Enter')
        await expect(client.page.locator('[data-project-agent]')).toContainText('Working…')
        const slow = await client.page.evaluate(() => window.api.projectChannels!.read())
        const lastUser = slow.channels[0].messages.findLast((row) => row.role === 'user')
        const deliveryId = lastUser?.deliveryIds?.[slow.channels[0].mainMemberId ?? '']
        if (!deliveryId) {
          throw new Error('The slow send has no recorded delivery identity')
        }
        const sentUuid = claudePromptUuidForSubmission(
          sessionId,
          agentJournalSubmissionKey(deliveryId)
        )
        const frames = () =>
          readFileSync(`${claudeStub.launchLog}.requests.jsonl`, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        await expect
          .poll(
            () =>
              frames().filter((frame) => frame.type === 'user' && frame.uuid === sentUuid).length
          )
          .toBe(1)
        const sessionPid = frames().find(
          (frame) => frame.type === 'user' && frame.uuid === sentUuid
        ).pid
        await client.page.getByRole('button', { name: 'Stop', exact: true }).click()
        await expect(client.page.locator('[data-project-agent]')).toContainText('Ready')
        await expect
          .poll(
            () =>
              frames().filter((frame) => frame.subtype === 'interrupt' && frame.pid === sessionPid)
                .length
          )
          .toBe(1)
        const localOwner = await client.page.evaluate(
          (sessionId) =>
            window.api.runtime.call({
              method: 'agentSession.handoffStatus',
              params: { sessionId }
            }),
          sessionId
        )
        expect(localOwner.ok).toBe(false)
        await client.page.reload()
        await client.page.getByRole('button', { name: 'Bots', exact: true }).click()
        await client.page.getByRole('button', { name: 'Shared project', exact: false }).click()
        await expect(
          client.page.getByRole('log').getByText('Stub reply.', { exact: true })
        ).toHaveCount(1)
        await client.page.screenshot({ path: testInfo.outputPath(`shamu-shared-${owner}.png`) })
        await client.dispose()
        disposed = true
        const primaryOwner = await primary.evaluate(
          (sessionId) =>
            window.api.runtime.call({
              method: 'agentSession.handoffStatus',
              params: { sessionId }
            }),
          sessionId
        )
        expect(primaryOwner).toMatchObject({ ok: true, result: { owner: 'native' } })
      } finally {
        if (existsSync(`${claudeStub.launchLog}.requests.jsonl`)) {
          await testInfo.attach('provider-requests', {
            path: `${claudeStub.launchLog}.requests.jsonl`,
            contentType: 'application/jsonl'
          })
        }
        const sourceHistory = await primary.evaluate(
          (sessionId) =>
            window.api.runtime.call({
              method: 'agentSession.history',
              params: { sessionId, direction: 'tail' }
            }),
          sessionId
        )
        await testInfo.attach('source-journal', {
          body: JSON.stringify(sourceHistory),
          contentType: 'application/json'
        })
        if (!disposed) {
          await client.dispose()
        }
      }
    })
  }
})
