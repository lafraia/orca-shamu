import { expect, it } from 'vitest'
import { createNativeChatBotCatalogue } from './native-chat-bot-catalogue'
import { splitNativeChatBotReferences } from './native-chat-bot-text-references'

const catalogue = createNativeChatBotCatalogue([
  { id: 'ceo', name: 'CEO' },
  { id: 'dev', name: 'Dev' },
  { id: 'vagalume', name: 'Dev: Vagalume' },
  { id: 'qa', name: 'QA (PT)' },
  { id: 'jose', name: 'José Ávila' }
])
it('recognizes plain bot names only when requested and retains the original memory text', () => {
  const text = 'Source: CEO, notificação 123. O Dev: Vagalume consulta @QA (PT) e José Ávila.'
  const parts = splitNativeChatBotReferences(text, catalogue, true)
  expect(parts.filter((part) => part.bot).map((part) => part.bot?.id)).toEqual([
    'ceo',
    'vagalume',
    'qa',
    'jose'
  ])
  expect(parts.map((part) => part.text).join('')).toBe(text)
  expect(
    splitNativeChatBotReferences(text, catalogue)
      .filter((part) => part.bot)
      .map((part) => part.bot?.id)
  ).toEqual(['qa'])
})
it('does not turn email addresses, paths, filenames or longer identifiers into bot links', () => {
  const text =
    'CEO@example.com CEO+alerts@example.com a@CEO https://CEO.example/path https://example.com/?name=CEO /CEO CEO.md CEO_extra OtherCEO @CEO_extra @@CEO'
  expect(splitNativeChatBotReferences(text, catalogue, true).some((part) => part.bot)).toBe(false)
})
it('keeps sentence punctuation outside the bot reference', () => {
  const parts = splitNativeChatBotReferences('CEO. Depois, (CEO), @CEO!', catalogue, true)
  expect(parts.filter((part) => part.bot).map((part) => part.text)).toEqual(['CEO', 'CEO', '@CEO'])
})
it('keeps ambiguous names plain rather than linking a shorter bot with the same prefix', () => {
  const ambiguous = createNativeChatBotCatalogue([
    { id: 'dev', name: 'Dev' },
    { id: 'one', name: 'Dev: Vagalume' },
    { id: 'two', name: 'dev: vagalume' }
  ])
  const text = 'Dev: Vagalume, @Dev: Vagalume e Dev.'
  const parts = splitNativeChatBotReferences(text, ambiguous, true)
  expect(parts.filter((part) => part.bot).map((part) => part.text)).toEqual(['Dev'])
  expect(parts.map((part) => part.text).join('')).toBe(text)
})
it('retains unknown names and empty memory values without inventing destinations', () => {
  expect(splitNativeChatBotReferences('Unknown', catalogue, true)).toEqual([
    { start: 0, text: 'Unknown' }
  ])
  expect(
    splitNativeChatBotReferences('', catalogue, true)
      .map((part) => part.text)
      .join('')
  ).toBe('')
})
