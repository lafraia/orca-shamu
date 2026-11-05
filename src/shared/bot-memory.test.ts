import { describe, expect, it } from 'vitest'
import {
  BOT_MEMORY_CONTEXT_CHARACTERS,
  botMemorySchema,
  selectBotMemory,
  type BotMemoryEntry
} from './bot-memory'

function note(index: number, change: Partial<BotMemoryEntry> = {}): BotMemoryEntry {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    key: `topic ${index}`,
    scope: 'bot',
    text: 'Routine project note',
    sources: [{ sessionId: 'session', label: 'User decision' }],
    kind: 'fact',
    pinned: false,
    archived: false,
    updatedAt: index,
    ...change
  }
}

describe('bot memory recall', () => {
  it('recalls corrected decisions and pending task state without reviving old values', () => {
    const previous = note(1, { key: 'Deadline', text: 'Proposal due Tuesday', archived: true })
    const corrected = note(2, {
      key: 'Deadline',
      text: 'Proposal due Friday',
      supersedes: previous.id
    })
    const task = note(3, { kind: 'task', text: 'Next action: calculate the price' })
    const unrelated = note(4, { text: 'Birthday gift ideas' })
    const selected = selectBotMemory(
      { version: 1, entries: [previous, corrected, task, unrelated] },
      'What is the proposal deadline?'
    )
    expect(selected.entries).toEqual([corrected, task])
    expect(selected.omitted).toBe(1)
    expect(selected.details).toMatchObject({
      strategy: 'terms-v1',
      unmatched: 1,
      overBudget: 0,
      matches: [
        { id: corrected.id, terms: ['proposal', 'deadline'] },
        { id: task.id, terms: ['the'] }
      ]
    })
  })
  it('keeps pinned notes and recent summaries within a hard additional-context budget', () => {
    const entries = Array.from({ length: 40 }, (_, index) =>
      note(index, { text: 'x'.repeat(2000), kind: 'summary' })
    )
    const pinned = note(99, { text: 'Check current sources before acting', pinned: true })
    const selected = selectBotMemory({ version: 1, entries: [...entries, pinned] }, 'x')
    expect(selected.entries[0]).toEqual(pinned)
    expect(selected.entries[1]).toEqual(entries[39])
    expect(selected.characters).toBeLessThanOrEqual(BOT_MEMORY_CONTEXT_CHARACTERS)
    expect(selected.entries.length + selected.omitted).toBe(41)
    expect(selected.details.unmatched).toBe(0)
    expect(selected.details.overBudget).toBe(selected.omitted)
    expect(entries).toHaveLength(40)
  })
  it('keeps facts scoped, handles accents, and rejects conflicting live values without destroying the archive', () => {
    const old = note(1, { key: 'Entrega', scope: 'Vagalume', archived: true })
    const current = note(2, {
      key: 'Entrega',
      scope: 'Vagalume',
      text: 'Revisão na sexta',
      supersedes: old.id
    })
    expect(selectBotMemory({ version: 1, entries: [old, current] }, 'revisao').entries).toEqual([
      current
    ])
    expect(botMemorySchema.safeParse({ version: 1, entries: [old, current] }).success).toBe(true)
    expect(
      botMemorySchema.safeParse({
        version: 1,
        entries: [current, note(3, { key: 'Entrega', scope: 'Vagalume' })]
      }).success
    ).toBe(false)
    expect(
      botMemorySchema.safeParse({ version: 1, entries: [note(1, { sources: [] })] }).success
    ).toBe(false)
  })
})
