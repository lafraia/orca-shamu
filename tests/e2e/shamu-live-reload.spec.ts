import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { basename, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { buildFakeAgentCommandOverride } from './helpers/fake-agent-command-override'
import { createChatOnHost, SUPPORTED } from './helpers/structured-claude-stub'
import { launchPairedElectronClient } from './helpers/paired-electron-client'
import { createShamuLiveServer } from '../../config/scripts/shamu-live-server.mjs'

test('hot reloads Bots without restarting its window, losing its draft or duplicating a reply', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Cold-start Vite and both desktops, exercise HMR and replace the live server before shutdown.
  test.setTimeout(180_000)
  await waitForSessionReady(primary)
  const workspaceId = await waitForActiveWorktree(primary)
  await primary.evaluate(async (command) => {
    await window.__store!.getState().updateSettings({
      nativeChatProviders: { claude: true },
      defaultTuiAgent: 'claude',
      agentCmdOverrides: { claude: command }
    })
  }, buildFakeAgentCommandOverride(claudeStub.command))
  const sessionId = await createChatOnHost(primary, workspaceId)
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

  const scratch = mkdtempSync(resolve('src/renderer/src/shamu-hmr-fixture-'))
  const probeFile = join(scratch, 'probe.ts')
  const probeCache = resolve('.cache/vite', basename(scratch))
  const sidebar = resolve('src/renderer/src/components/project-channels/ProjectChannelSidebar.tsx')
  writeFileSync(probeFile, "export const shamuHmrProbe = 'initial'\n")
  const probe: Plugin = {
    name: 'shamu-hmr-isolated-probe',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== sidebar) {
        return
      }
      this.addWatchFile(probeFile)
      return `import { shamuHmrProbe } from ${JSON.stringify(`/@fs/${probeFile}`)};\n${code.replace(
        '<Bot />',
        '<Bot data-shamu-hmr={shamuHmrProbe} />'
      )}`
    }
  }
  const oldNodeEnv = process.env.NODE_ENV
  const oldViteEnv = process.env.NODE_ENV_ELECTRON_VITE
  process.env.NODE_ENV = 'development'
  process.env.NODE_ENV_ELECTRON_VITE = 'development'
  const live = await createShamuLiveServer({ cacheDir: probeCache, plugins: [probe] })
  let client: Awaited<ReturnType<typeof launchPairedElectronClient>> | undefined
  let impostor: ReturnType<typeof createHttpServer> | undefined
  try {
    client = await launchPairedElectronClient(offer, testInfo, 'Primary Orca', {
      extraEnv: { ORCA_SHAMU_CLIENT: '1', ...live.env },
      connect: async (page) => {
        await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toBeVisible()
        await page.getByLabel('Primary Orca access link', { exact: true }).fill(offer.pairingUrl)
        await page.getByRole('button', { name: 'Connect to primary Orca', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Orca Shamu', exact: true })).toHaveCount(0)
        const binding = await page.evaluate(() => window.api.shamuClient!.read())
        if (!binding.environmentId) {
          throw new Error('Shamu did not retain its binding')
        }
        return binding.environmentId
      }
    })
    const { page } = client
    await expect(page.getByText('Live reload', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Bots', exact: true }).locator('svg')
    ).toHaveAttribute('data-shamu-hmr', 'initial')
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          ({ workspaceId, sessionId }) =>
            window
              .__store!.getState()
              .unifiedTabsByWorktree[workspaceId]?.some((row) => row.entityId === sessionId) ??
            false,
          { workspaceId, sessionId }
        )
      )
      .toBe(true)
    const tabId = await page.evaluate(
      async ({ workspaceId, sessionId }) => {
        const state = window.__store!.getState()
        state.setActiveWorktree(workspaceId)
        const tab = state.unifiedTabsByWorktree[workspaceId]?.find(
          (row) => row.entityId === sessionId
        )
        if (!tab) {
          throw new Error('Primary chat was not mirrored')
        }
        state.activateTab(tab.id, { worktreeId: workspaceId })
        return tab.id
      },
      { workspaceId, sessionId }
    )
    await page
      .locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
      .click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Create bot from chat…' }).click()
    await page.getByLabel('Bot name', { exact: true }).fill('Live team')
    await page.getByRole('button', { name: 'Create bot', exact: true }).click()
    await expect(page.locator('[data-project-agent]')).toContainText('Ready')
    const composer = page.getByRole('textbox', { name: 'Message bot', exact: true })
    await composer.fill('One reply before hot reload')
    await composer.press('Enter')
    await expect(page.getByRole('log').getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await composer.fill('Keep this unsent draft')
    const documentId = await page.evaluate(() => {
      document.documentElement.dataset.shamuHmrDocument = crypto.randomUUID()
      return document.documentElement.dataset.shamuHmrDocument
    })
    const editStarted = Date.now()
    live.server.watcher.add(probeFile)
    await expect
      .poll(() =>
        Object.values(live.server.watcher.getWatched()).some((files) =>
          files.includes(basename(probeFile))
        )
      )
      .toBe(true)
    writeFileSync(probeFile, "export const shamuHmrProbe = 'updated'\n")
    await expect(
      page.getByRole('button', { name: 'Bots', exact: true }).locator('svg')
    ).toHaveAttribute('data-shamu-hmr', 'updated', { timeout: 30_000 })
    await testInfo.attach('hmr-latency', {
      body: JSON.stringify({ updateMs: Date.now() - editStarted }),
      contentType: 'application/json'
    })
    expect(await page.evaluate(() => document.documentElement.dataset.shamuHmrDocument)).toBe(
      documentId
    )
    await expect(composer).toHaveValue('Keep this unsent draft')
    await expect(page.getByRole('log').getByText('Stub reply.', { exact: true })).toHaveCount(1)
    expect(
      await client.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible())
      )
    ).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('shamu-live-reload.png') })
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await expect(composer).toHaveValue('Keep this unsent draft')
    await expect(page.getByRole('log').getByText('Stub reply.', { exact: true })).toHaveCount(1)
    await live.server.close()
    let impostorRequests = 0
    impostor = createHttpServer((_request, response) => {
      impostorRequests += 1
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(
        '<html><title>Untrusted replacement renderer</title><body>Untrusted replacement renderer</body></html>'
      )
    })
    await new Promise<void>((done) =>
      impostor!.listen(Number(new URL(live.url).port), '127.0.0.1', done)
    )
    const rejectedReload = page.waitForEvent('requestfailed', {
      predicate: (request) => request.isNavigationRequest() && request.url().startsWith(live.url)
    })
    await client.app.evaluate(({ BrowserWindow }, url) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith(url)
      )
      if (!window) {
        throw new Error('Live renderer window is missing')
      }
      window.webContents.reloadIgnoringCache()
    }, live.url)
    expect((await rejectedReload).failure()?.errorText).toContain('ERR_BLOCKED_BY_CLIENT')
    expect(impostorRequests).toBeGreaterThan(0)
    expect(
      await client.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => window.webContents.getTitle())
      )
    ).not.toContain('Untrusted replacement renderer')
    await client.dispose()
    client = undefined
    const owner = await primary.evaluate(
      (sessionId) =>
        window.api.runtime.call({ method: 'agentSession.handoffStatus', params: { sessionId } }),
      sessionId
    )
    expect(owner).toMatchObject({ ok: true, result: { owner: 'native' } })
  } finally {
    if (impostor) {
      impostor.closeAllConnections()
      await new Promise<void>((done) => impostor!.close(() => done()))
    }
    await client?.dispose()
    await live.server.close()
    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = oldNodeEnv
    }
    if (oldViteEnv === undefined) {
      delete process.env.NODE_ENV_ELECTRON_VITE
    } else {
      process.env.NODE_ENV_ELECTRON_VITE = oldViteEnv
    }
    rmSync(scratch, { recursive: true, force: true })
    rmSync(probeCache, { recursive: true, force: true })
  }
})
