import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { SUPPORTED } from './helpers/structured-claude-stub'
import { launchShamuBots } from './helpers/paired-shamu-bots'

test('bot appearance and uploaded photos survive editing and reload without replacing the chat', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Paired desktops create a bot, edit its appearance and persist a real PNG upload.
  test.setTimeout(120_000)
  const client = await launchShamuBots(primary, claudeStub.command, testInfo)
  try {
    const page = client.page
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page.getByRole('button', { name: 'New bot', exact: true }).first().click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Bot name', { exact: true }).fill('Designer')
    await dialog.getByRole('button', { name: 'star', exact: true }).click()
    await dialog.getByRole('button', { name: 'coral', exact: true }).click()
    await dialog.getByRole('button', { name: 'curious', exact: true }).click()
    await dialog.getByRole('switch', { name: 'Animate avatar', exact: true }).click()
    await page.screenshot({
      path: testInfo.outputPath('bot-appearance-dark.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: 'Create bot', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Designer', exact: true }).getByRole('textbox')
    ).toBeVisible()
    const before = await page.evaluate(
      async () => (await window.api.projectChannels!.read()).channels[0]
    )
    expect(before.identity).toMatchObject({
      color: 'coral',
      animated: false,
      shape: 'star',
      expression: 'curious'
    })
    await page.getByRole('button', { name: 'Bot settings', exact: true }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Bot image', { exact: true }).setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    })
    await expect(dialog.locator('.bot-avatar img')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save bot', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await page
      .getByRole('navigation', { name: 'Bots', exact: true })
      .getByRole('button', { name: 'Designer', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: 'Designer', exact: true }).locator('header .bot-avatar img')
    ).toBeVisible()
    const photo = await page.evaluate(
      async () => (await window.api.projectChannels!.read()).channels[0]
    )
    expect(photo.members).toEqual(before.members)
    expect(photo.home).toEqual(before.home)
    expect(photo.identity?.image).toMatch(/^data:image\/png;base64,/)
    await page.getByRole('button', { name: 'Bot settings', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Use animated avatar', exact: true })
      .click()
    await page.evaluate(async () =>
      window.__store!.getState().updateSettingsOrThrow({ theme: 'light' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.screenshot({
      path: testInfo.outputPath('bot-appearance-light.png'),
      animations: 'disabled'
    })
    await page.getByRole('dialog').getByRole('button', { name: 'Save bot', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const restored = await page.evaluate(
      async () => (await window.api.projectChannels!.read()).channels[0]
    )
    expect(restored.identity).toMatchObject({
      color: 'coral',
      animated: false,
      shape: 'star',
      expression: 'curious'
    })
    expect(restored.identity?.image).toBeUndefined()
    expect(restored.members).toEqual(before.members)
  } finally {
    await client.dispose()
  }
})
