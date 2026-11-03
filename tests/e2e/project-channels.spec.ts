import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { SUPPORTED, createChatOnHost } from './helpers/structured-claude-stub'
import { test } from './helpers/project-channel-stub'
import { existsSync } from 'node:fs'

test.describe('shared project channels', () => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')

  for (const owner of ['worktree', 'folder'] as const) {
    test(`promotes a ${owner} chat and shares replies without restarting its agents`, async ({
      orcaPage: page,
      claudeStub,
      seededRepoPath
    }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await waitForSessionReady(page)
      let workspaceId = await waitForActiveWorktree(page)
      await page.evaluate(async (command) => {
        await window.__store!.getState().updateSettings({
          nativeChatProviders: { claude: true },
          defaultTuiAgent: 'claude',
          agentCmdOverrides: { claude: command }
        })
      }, buildFakeAgentCommandOverride(claudeStub.command))
      if (owner === 'folder') {
        workspaceId = await page.evaluate(async (folderPath) => {
          const store = window.__store!
          const group = await store.getState().createProjectGroup('Project conversations', 'local')
          if (!group) {
            throw new Error('Could not make fixture group')
          }
          const folder = await store.getState().createFolderWorkspace(
            {
              projectGroupId: group.id,
              name: 'Coordinator folder',
              folderPath
            },
            { runtimeEnvironmentId: null }
          )
          if (!folder) {
            throw new Error('Could not make fixture folder')
          }
          const id = `folder:${folder.id}`
          store.getState().setActiveWorktree(id)
          return id
        }, seededRepoPath)
      }
      const main = await createChatOnHost(page, workspaceId)
      const other = await createChatOnHost(page, workspaceId)
      await expect.poll(() => existsSync(claudeStub.launchLog)).toBe(true)
      await expect
        .poll(() =>
          page.evaluate(
            ({ workspaceId, main, other }) => {
              const tabs = window.__store!.getState().unifiedTabsByWorktree[workspaceId] ?? []
              return (
                tabs.some((tab) => tab.entityId === main) &&
                tabs.some((tab) => tab.entityId === other)
              )
            },
            { workspaceId, main, other }
          )
        )
        .toBe(true)
      const tabId = await page.evaluate(
        ({ workspaceId, main, other }) => {
          const state = window.__store!.getState()
          const mainTab = state.unifiedTabsByWorktree[workspaceId].find(
            (tab) => tab.entityId === main
          )!
          const otherTab = state.unifiedTabsByWorktree[workspaceId].find(
            (tab) => tab.entityId === other
          )!
          state.setTabCustomLabel(mainTab.id, 'Coordinator')
          state.setTabCustomLabel(otherTab.id, 'Researcher')
          state.setActiveWorktree(workspaceId)
          state.activateTab(mainTab.id, { worktreeId: workspaceId })
          return mainTab.id
        },
        { workspaceId, main, other }
      )
      await page
        .locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
        .click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Use as main project chat…' }).click()
      await page.getByLabel('Project name', { exact: true }).fill('Website')
      await page.getByRole('button', { name: 'Save project', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Website', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Agents', exact: false }).click()
      await page.getByLabel('Choose chat tab', { exact: true }).click()
      await page.getByRole('option', { name: 'Researcher · claude', exact: true }).click()
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByLabel('Agent handle', { exact: true }).last().fill('researcher')
      await page.getByRole('button', { name: 'Save project', exact: true }).click()
      await expect(page.locator('[data-project-agent="researcher"]')).toContainText('Ready')
      const input = page.getByRole('textbox', { name: 'Message project', exact: true })
      await input.fill('Hello coordinator')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.getByRole('log').getByText('Stub reply.', { exact: true })).toHaveCount(1, {
        timeout: 30_000
      })
      await expect(page.locator('[data-project-agent="claude"]')).toContainText('Ready')
      await input.fill('@researcher Compare the options')
      await input.press('Enter')
      await expect(page.getByRole('log').getByText('Stub reply.', { exact: true })).toHaveCount(2, {
        timeout: 30_000
      })
      await expect(
        page.getByRole('log').getByText('Current user message:', { exact: true })
      ).toHaveCount(0)
      await input.fill('Unfinished project message')
      await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
      await page.getByRole('button', { name: 'Projects', exact: true }).click()
      await expect(input).toHaveValue('Unfinished project message')
      await page.reload()
      await page.getByRole('button', { name: 'Website', exact: false }).click()
      await expect(page.getByRole('log').getByText('Stub reply.', { exact: true })).toHaveCount(2)
      await expect(input).toHaveValue('Unfinished project message')
      await expect(
        page.getByRole('log').getByText('Hello coordinator', { exact: true })
      ).toHaveCount(1)
      await page.screenshot({ path: testInfo.outputPath(`project-channel-${owner}.png`) })
    })
  }
})
