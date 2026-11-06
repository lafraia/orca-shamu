import type { Locator, Page } from '@playwright/test'
import { test } from './helpers/project-channel-stub'
import { expect } from './helpers/orca-app'
import { SUPPORTED } from './helpers/structured-claude-stub'
import { createShamuBot, launchShamuBots } from './helpers/paired-shamu-bots'

async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  edge: 'before' | 'after'
): Promise<void> {
  const start = await source.boundingBox()
  const end = await target.boundingBox()
  if (!start || !end) {
    throw new Error('Sidebar drag target is missing')
  }
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 6)
  await page.mouse.move(
    end.x + end.width / 2,
    edge === 'before' ? end.y + 2 : end.y + end.height - 2,
    { steps: 12 }
  )
  await page.mouse.up()
}

test('groups and bots move by drag or keyboard and retain conversations and drafts after restart', async ({
  orcaPage: primary,
  claudeStub
}, testInfo) => {
  test.skip(!SUPPORTED, 'the isolated Claude protocol fixture requires POSIX')
  // Two paired desktops provision four bots and restore their saved conversations.
  test.setTimeout(120_000)
  const client = await launchShamuBots(primary, claudeStub.command, testInfo)
  try {
    const page = client.page
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    for (const name of ['CEO', 'Mobile', 'Web', 'Platform']) {
      await createShamuBot(page, name)
    }
    const identities = await page.evaluate(async () => {
      const snapshot = await window.api.projectChannels!.read()
      for (const bot of snapshot.channels) {
        await window.api.projectChannels!.command({
          action: 'organize',
          botId: bot.id,
          section: bot.name === 'Platform' ? 'Engineering' : 'Product',
          pinned: bot.name === 'CEO'
        })
      }
      return snapshot.channels
        .map(({ id, members, home }) => ({ id, members, home }))
        .sort((a, b) => a.id.localeCompare(b.id))
    })
    const sidebar = page.getByRole('navigation', { name: 'Bots', exact: true })
    const names = () =>
      sidebar
        .getByRole('region')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    const group = (name: string) => sidebar.getByRole('region', { name, exact: true })
    const bot = (name: string) => sidebar.getByRole('button', { name, exact: true })
    const order = (name: string) =>
      group(name)
        .locator('button[data-current]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    const composer = page
      .getByRole('region', { name: 'Platform', exact: true })
      .getByRole('textbox')
    await composer.fill('Keep my unfinished draft')
    await expect.poll(names).toEqual(['Pinned', 'Product', 'Engineering'])
    await page.getByRole('button', { name: 'Group actions: Product', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Move down', exact: true }).click()
    await expect.poll(names).toEqual(['Pinned', 'Engineering', 'Product'])
    await page.getByRole('button', { name: 'Group actions: Product', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Rename group…', exact: true }).click()
    const rename = page.getByRole('dialog', { name: 'Rename group', exact: true })
    await rename.getByLabel('Group name', { exact: true }).fill('Development')
    await rename.getByRole('button', { name: 'Save group', exact: true }).click()
    await expect.poll(names).toEqual(['Pinned', 'Engineering', 'Development'])
    await drag(
      page,
      group('Engineering').getByRole('button', { name: 'Toggle group: Engineering', exact: true }),
      group('Development'),
      'after'
    )
    await expect.poll(names).toEqual(['Pinned', 'Development', 'Engineering'])
    await drag(
      page,
      group('Engineering').getByRole('button', { name: 'Toggle group: Engineering', exact: true }),
      group('Development'),
      'before'
    )
    await expect.poll(names).toEqual(['Pinned', 'Engineering', 'Development'])
    await drag(page, bot('Web'), bot('Mobile'), 'before')
    await expect.poll(() => order('Development')).toEqual(['Web', 'Mobile'])
    await group('Development')
      .getByRole('button', { name: 'Toggle group: Development', exact: true })
      .click()
    await drag(page, bot('Platform'), group('Development'), 'after')
    await expect.poll(names).toEqual(['Pinned', 'Development'])
    await group('Development')
      .getByRole('button', { name: 'Toggle group: Development', exact: true })
      .click()
    await expect.poll(() => order('Development')).toEqual(['Web', 'Mobile', 'Platform'])
    await expect(composer).toHaveText('Keep my unfinished draft')
    await expect(bot('Platform')).toHaveAttribute('aria-current', 'page')
    await sidebar.getByLabel('Find bot', { exact: true }).fill('l')
    await drag(page, bot('Mobile'), bot('Platform'), 'after')
    await sidebar.getByLabel('Find bot', { exact: true }).fill('')
    await expect.poll(() => order('Development')).toEqual(['Web', 'Platform', 'Mobile'])
    await bot('Mobile').focus()
    await page.keyboard.press('Alt+ArrowUp')
    await expect.poll(() => order('Development')).toEqual(['Web', 'Mobile', 'Platform'])
    await page.reload()
    await page.getByRole('button', { name: 'Bots', exact: true }).click()
    await expect.poll(names).toEqual(['Pinned', 'Development'])
    await expect.poll(() => order('Development')).toEqual(['Web', 'Mobile', 'Platform'])
    await bot('Platform').click()
    await expect(
      page.getByRole('region', { name: 'Platform', exact: true }).getByRole('textbox')
    ).toHaveText('Keep my unfinished draft')
    const saved = await page.evaluate(async () =>
      (await window.api.projectChannels!.read()).channels
        .map(({ id, members, home }) => ({ id, members, home }))
        .sort((a, b) => a.id.localeCompare(b.id))
    )
    expect(saved).toEqual(identities)
  } finally {
    await client.dispose()
  }
})
