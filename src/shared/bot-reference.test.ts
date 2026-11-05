import { expect, it } from 'vitest'
import { botReferenceHref, botReferenceId, botReferenceMarkdown } from './bot-reference'

it('creates a named Markdown reference with a stable destination and escaped label', () => {
  const bot = { id: 'id/(one) space', name: 'QA [A]\\B' }
  const href = botReferenceHref(bot.id)
  expect(href).toBe('#orca-shamu-bot/id%2F%28one%29%20space')
  expect(botReferenceId(href)).toBe(bot.id)
  expect(botReferenceMarkdown(bot)).toBe(`[@QA \\[A\\]\\\\B](${href})`)
})

it('does not resolve unrelated, empty or malformed bot destinations', () => {
  for (const href of [undefined, 'https://example.com', '#orca-shamu-bot/', '#orca-shamu-bot/%']) {
    expect(botReferenceId(href)).toBeNull()
  }
})
