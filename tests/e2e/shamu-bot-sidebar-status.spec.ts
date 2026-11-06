import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { SUPPORTED } from './helpers/structured-claude-stub'
import { createShamuBot, launchShamuBots } from './helpers/paired-shamu-bots'

test.use({ claudeSidebarQuestions: true })

test('the sidebar follows live work and pending questions even while another bot chat is open', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Two paired desktops drive a held turn and answer a synthetic provider question.
  test.setTimeout(120_000)
  const client = await launchShamuBots(primary, claudeStub.command, testInfo)
  try {
    const page = client.page
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await createShamuBot(page, 'Coordinator')
    await createShamuBot(page, 'Researcher')
    const sidebar = page.getByRole('navigation', { name: 'Bots', exact: true })
    const researcher = sidebar.getByRole('button', { name: 'Researcher', exact: true })
    const chat = page.getByRole('region', { name: 'Researcher', exact: true })
    const composer = chat.getByRole('textbox')
    await composer.fill('slow sidebar work')
    await composer.press('Enter')
    await expect(researcher.getByRole('img', { name: 'Working', exact: true })).toBeVisible()
    await sidebar.getByRole('button', { name: 'Coordinator', exact: true }).click()
    await expect(researcher.getByRole('img', { name: 'Working', exact: true })).toBeVisible()
    await sidebar.getByLabel('Find bot', { exact: true }).hover()
    await page.screenshot({
      path: testInfo.outputPath('bot-sidebar-working-dark.png'),
      animations: 'disabled'
    })
    await researcher.hover()
    await page.screenshot({
      path: testInfo.outputPath('bot-sidebar-hover-dark.png'),
      animations: 'disabled'
    })
    await researcher.click()
    await chat.getByRole('button', { name: 'Stop the agent', exact: true }).click()
    await expect(chat.getByRole('button', { name: 'Stop the agent', exact: true })).toHaveCount(0)
    await composer.fill('sidebar-question')
    await composer.press('Enter')
    await expect(
      researcher.getByRole('img', { name: 'Waiting for input', exact: true })
    ).toBeVisible()
    await sidebar.getByRole('button', { name: 'Coordinator', exact: true }).click()
    await expect(
      researcher.getByRole('img', { name: 'Waiting for input', exact: true })
    ).toBeVisible()
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'light' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await sidebar.getByLabel('Find bot', { exact: true }).hover()
    await page.screenshot({
      path: testInfo.outputPath('bot-sidebar-waiting-light.png'),
      animations: 'disabled'
    })
    await researcher.click()
    await chat.getByRole('button', { name: /Continue.*Complete the synthetic turn/ }).click()
    await chat.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(
      researcher.getByRole('img', { name: 'Waiting for input', exact: true })
    ).toHaveCount(0)
    await expect(chat.getByRole('button', { name: 'Stop the agent', exact: true })).toHaveCount(0)
    await expect(researcher.getByRole('img', { name: 'Done', exact: true })).toHaveCount(0)
  } finally {
    await client.dispose()
  }
})
