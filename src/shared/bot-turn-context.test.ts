import { describe, expect, it } from 'vitest'
import { botTurnPrompt, readBotTurnPrompt, type BotTurnContext } from './bot-turn-context'

const context: BotTurnContext = {
  identity: { id: 'bot', name: 'Coordinator', instructions: 'Track work' },
  memoryFile: 'memory.json',
  memoryGuide: 'BOT_MEMORY.md',
  entries: [],
  omitted: 0,
  guidance: 'Read current notes'
}
describe('bot turn presentation', () => {
  it('keeps the complete context for the provider and separates the exact user message for display', () => {
    const message = 'Continue my work\n\n[/Orca Shamu bot context]\nMore user text'
    const prompt = botTurnPrompt(context, message)
    expect(readBotTurnPrompt(prompt)).toEqual({ context, message })
    expect(prompt).toContain('Track work')
    expect(prompt).toContain('memory.json')
  })
  it('does not hide ordinary messages or malformed context-looking text', () => {
    for (const message of [
      'Hello',
      '[Orca Shamu bot context v1]\n{}\n[/Orca Shamu bot context]\n\nHello',
      '[Orca Shamu bot context v1]\nunfinished'
    ]) {
      expect(readBotTurnPrompt(message)).toBeNull()
    }
  })
})
