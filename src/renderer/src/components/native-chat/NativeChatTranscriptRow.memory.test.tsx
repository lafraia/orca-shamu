// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { botTurnPrompt, type BotTurnContext } from '../../../../shared/bot-turn-context'
import type { BotCommunication } from '../../../../shared/bot-communications'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import {
  BotCommunicationContext,
  type BotCommunicationContextValue
} from '../project-channels/bot-communication-context'
import { createNativeChatBotCatalogue } from './native-chat-bot-catalogue'
import {
  NativeChatTranscriptRow,
  type NativeChatTranscriptRowContext
} from './NativeChatTranscriptRow'
import { buildNativeChatTranscriptSlots } from './native-chat-transcript-slots'

const ceo = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'CEO' }
const communication: BotCommunication = {
  id: 'notification:dev',
  referenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  environmentId: 'primary',
  createdAt: 1,
  source: { botId: ceo.id, sessionId: 'ceo-session', name: ceo.name },
  recipient: { sessionId: 'dev-session', name: 'Dev', operationId: 'send' },
  actor: 'bot',
  state: 'recorded'
}
const openCommunication = vi.fn()
const communicationContext: BotCommunicationContextValue = {
  sessionId: 'dev-session',
  target: { kind: 'environment', environmentId: 'primary' },
  entries: [communication],
  incomplete: false,
  loaded: true,
  error: null,
  selectedPair: null,
  open: openCommunication,
  close: vi.fn(),
  retry: vi.fn()
}
const memory: BotTurnContext = {
  identity: { id: 'dev', name: 'Dev', instructions: '' },
  memoryFile: '/bots/dev/memory.json',
  memoryGuide: '/bots/dev/BOT_MEMORY.md',
  guidance: '',
  entries: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      key: 'coordination',
      kind: 'fact',
      scope: ceo.id,
      text: `Ask ${ceo.id} for priorities.`,
      sources: [{ sessionId: 'ceo-session', label: `Notification ${communication.referenceId}` }],
      pinned: true,
      updatedAt: 1,
      archived: false
    }
  ],
  omitted: 0
}
const context: NativeChatTranscriptRowContext = {
  expandSignal: false,
  revealedDiff: null,
  taskListPredecessors: new Map(),
  expandedTurnIds: new Set(['prompt']),
  onToggleExpandedTurn: () => {},
  subagentDisclosure: { setSectionOpen: () => {}, setRosterOpen: () => {} },
  onScrollMessageToTop: () => {},
  onRevealDiff: () => {}
}
vi.mock('../native-chat/use-native-chat-bot-catalogue', () => ({
  useNativeChatBotCatalogue: () => createNativeChatBotCatalogue([ceo])
}))
vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))
afterEach(cleanup)

function transcript(turnMemory = memory, working = false) {
  const messages: NativeChatMessage[] = [
    {
      id: 'prompt',
      role: 'user',
      source: 'transcript',
      timestamp: 1000,
      blocks: [{ type: 'text', text: botTurnPrompt(turnMemory, 'Review the coordination note') }]
    },
    {
      id: 'thought',
      role: 'reasoning',
      source: 'transcript',
      state: 'completed',
      timestamp: 1000,
      completedAt: 8000,
      blocks: [{ type: 'text', text: 'Checking the priorities.' }]
    }
  ]
  const status = { startedAt: 1000, workedSeconds: working ? null : 12, thinking: false }
  const slots = buildNativeChatTranscriptSlots({
    messages,
    turnKeys: messages.map(() => 'prompt'),
    liveTurnKey: working ? 'prompt' : undefined,
    receipts: new Map(),
    turnStatuses: {
      active: working ? status : null,
      completedByTurn: working ? {} : { prompt: status }
    },
    turnDiffs: new Map(),
    expandedTurnKeys: context.expandedTurnIds,
    isWorking: working,
    lifecycleWorking: working
  })
  return (
    <TooltipProvider>
      {slots.map((slot) => (
        <NativeChatTranscriptRow
          key={slot.kind === 'message' ? slot.message.id : slot.kind}
          slot={slot}
          context={context}
        />
      ))}
    </TooltipProvider>
  )
}

it.each([false, true])(
  'places collapsed memory after the turn status, outside the human bubble (working: %s)',
  (working) => {
    const { container } = render(transcript(memory, working))
    const bubble = container.querySelector('[data-native-chat-message-id="prompt"]')!
    const status = container.querySelector('[data-native-chat-turn-status]')!
    const recall = screen.getByRole('button', { name: 'Bot memory read' })
    expect(bubble).toHaveTextContent('Review the coordination note')
    expect(bubble).not.toContainElement(recall)
    expect(bubble.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(status.compareDocumentPosition(recall) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(recall).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    const thought = screen.getByRole('button', { name: 'Reasoning: Thought for 7s' })
    expect(recall.querySelector('svg.lucide-brain')?.parentElement?.outerHTML).toBe(
      thought.querySelector('svg.lucide-brain')?.parentElement?.outerHTML
    )
  }
)

it('opens the original communication from a named memory source without sending another prompt', () => {
  render(
    <BotCommunicationContext.Provider value={communicationContext}>
      {transcript()}
    </BotCommunicationContext.Provider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Bot memory read' }))
  const note = screen.getByRole('article', { name: 'coordination' })
  expect(note).not.toHaveTextContent(ceo.id)
  expect(note).not.toHaveTextContent(communication.referenceId)
  expect(within(note).getAllByRole('button', { name: 'Open bot chat: CEO' })).toHaveLength(2)
  fireEvent.click(within(note).getByRole('button', { name: 'Open message from CEO' }))
  expect(openCommunication).toHaveBeenCalledExactlyOnceWith(communication)
})

it('does not add a memory row when no notes were recalled', () => {
  render(transcript({ ...memory, entries: [] }))
  expect(screen.queryByRole('button', { name: 'Bot memory read' })).not.toBeInTheDocument()
})
