import { expect, it } from 'vitest'
import { botReferenceMarkdown } from '../../../../shared/bot-reference'
import { createNativeChatBotCatalogue } from '../native-chat/native-chat-bot-catalogue'
import { splitBotMemoryReferences } from './bot-memory-references'

const ceo = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'CEO' }
const dev = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Dev: Vagalume' }
const catalogue = createNativeChatBotCatalogue([ceo, dev])

it('collapses legacy name and UUID annotations into one bot reference without rewriting the source', () => {
  const text = `CEO (${ceo.id}) coordinates @Dev: Vagalume (bot ${dev.id}). Source: ${ceo.id}.`
  const parts = splitBotMemoryReferences(text, catalogue)
  expect(parts.filter((part) => part.bot).map((part) => part.text)).toEqual([
    `CEO (${ceo.id})`,
    `@Dev: Vagalume (bot ${dev.id})`,
    ceo.id
  ])
  expect(parts.filter((part) => part.bot).map((part) => part.bot?.name)).toEqual([
    ceo.name,
    dev.name,
    ceo.name
  ])
  expect(parts.map((part) => part.text).join('')).toBe(text)
})

it('resolves saved links by identity after a rename or when two bots have the same name', () => {
  const renamed = { ...ceo, name: 'Coordinator' }
  const ambiguous = createNativeChatBotCatalogue([renamed, { ...dev, name: renamed.name }])
  const text = `${botReferenceMarkdown(ceo)} asks ${botReferenceMarkdown(dev)}. Coordinator`
  const parts = splitBotMemoryReferences(text, ambiguous)
  expect(parts.filter((part) => part.bot).map((part) => part.bot)).toEqual([
    renamed,
    { ...dev, name: renamed.name }
  ])
  expect(parts.map((part) => part.text).join('')).toBe(text)
})

it('keeps unknown IDs and address tokens literal and never associates a mismatched name with an ID', () => {
  const unknown = '00000000-0000-4000-8000-000000000001'
  const text = `OtherCEO (${ceo.id}), CEO (${dev.id}), ${unknown}, https://example.com/${ceo.id}, /${ceo.id}, ${ceo.id}@example.com, ${ceo.id}.json`
  const parts = splitBotMemoryReferences(text, catalogue)
  expect(parts.filter((part) => part.bot).map((part) => part.text)).toEqual([ceo.id, 'CEO', dev.id])
  expect(parts.map((part) => part.text).join('')).toBe(text)
})

it('renders an unavailable saved link by its label without redirecting to a bot with the same name', () => {
  const text = botReferenceMarkdown({ id: 'deleted-bot', name: ceo.name })
  expect(splitBotMemoryReferences(text, catalogue)).toEqual([
    { start: 0, text, unavailableName: ceo.name }
  ])
  const escaped = botReferenceMarkdown({ id: 'deleted', name: 'QA [A]\\B' })
  expect(splitBotMemoryReferences(escaped, catalogue)[0].unavailableName).toBe('QA [A]\\B')
})

it('recognizes ordinary bot names alongside explicit references and handles an empty roster', () => {
  const text = `Ask @CEO. ${botReferenceMarkdown(dev)}`
  const parts = splitBotMemoryReferences(text, catalogue)
  expect(parts.filter((part) => part.bot).map((part) => part.bot)).toEqual([ceo, dev])
  expect(parts.map((part) => part.text).join('')).toBe(text)
  expect(splitBotMemoryReferences('', catalogue)).toEqual([])
  expect(splitBotMemoryReferences('plain note', createNativeChatBotCatalogue([]))).toEqual([
    { start: 0, text: 'plain note' }
  ])
})

it('resolves a legacy UUID written in uppercase without changing the saved value', () => {
  const text = ceo.id.toUpperCase()
  expect(splitBotMemoryReferences(text, catalogue)).toEqual([{ start: 0, text, bot: ceo }])
})
