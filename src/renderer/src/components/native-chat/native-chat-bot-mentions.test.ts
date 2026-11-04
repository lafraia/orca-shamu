import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import { selectedNativeChatBots } from './native-chat-bot-mentions'

const pill = {
  type: 'nativeChatBotReference',
  attrs: { botId: 'coordinator', label: 'Project Coordinator', token: '@Project Coordinator' }
}
const document: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [pill, { type: 'text', text: ' review this' }] }]
}

describe('selected bot mentions', () => {
  it('retains identity for names with spaces, and deduplicates repeated pills', () => {
    expect(selectedNativeChatBots('@Project Coordinator review this', document)).toEqual([
      { id: 'coordinator', name: 'Project Coordinator' }
    ])
    expect(
      selectedNativeChatBots('@Project Coordinator@Project Coordinator', {
        type: 'doc',
        content: [{ type: 'paragraph', content: [pill, pill] }]
      })
    ).toHaveLength(1)
  })
  it('does not dispatch literal mentions, pasted text, or a stale document', () => {
    expect(selectedNativeChatBots('@Project Coordinator review this')).toEqual([])
    expect(selectedNativeChatBots('changed text', document)).toEqual([])
    expect(
      selectedNativeChatBots('@Project Coordinator review this', {
        type: 'doc',
        content: [{ type: 'text', text: '@Project Coordinator review this' }]
      })
    ).toEqual([])
  })
})
