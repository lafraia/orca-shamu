// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentJournalSubmission } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'
import { ProjectChannelAgent } from './ProjectChannelAgent'

let channel = channelFixture()
let submissions: AgentJournalSubmission[] = []

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: object) => boolean) => selector({})
}))
vi.mock('./project-channel-candidates', () => ({
  availableProjectChannelMember: () => true,
  openProjectChannelSource: vi.fn()
}))
vi.mock('./project-channel-store', () => ({
  changeProjectChannel: async (
    _id: string,
    update: (channel: ProjectChannel) => ProjectChannel
  ) => {
    channel = update(channel)
  }
}))
vi.mock('./project-channel-transcript', () => ({ syncProjectChannelMessages: vi.fn() }))
vi.mock('../native-chat/NativeChatApprovalCard', () => ({ NativeChatApprovalCard: () => null }))
vi.mock('../native-chat/NativeChatStructuredQuestionCard', () => ({
  NativeChatStructuredQuestionCard: () => null
}))
vi.mock('../native-chat/use-structured-agent-session', () => ({
  useStructuredAgentSession: () => ({
    status: 'ready',
    readCurrent: true,
    messages: [],
    journalItems: [],
    submissions,
    isWorking: false,
    prompts: [],
    respond: vi.fn()
  })
}))
afterEach(cleanup)

it('expires an orphaned send after reload even while the reader remains unchanged', () => {
  vi.useFakeTimers()
  try {
    channel = channelFixture()
    channel.messages = [
      {
        id: 'orphan',
        role: 'user',
        text: 'Please compare',
        createdAt: Date.now(),
        deliveries: { coordinator: 'sending' },
        deliveryIds: { coordinator: 'lost-sender' }
      }
    ]
    submissions = []
    render(
      <ProjectChannelAgent
        channelId="project"
        member={channel.members[0]}
        controllers={new Map()}
      />
    )
    expect(channel.messages[0].deliveries?.coordinator).toBe('sending')
    act(() => vi.advanceTimersByTime(35_001))
    expect(channel.messages[0].deliveries?.coordinator).toBe('unconfirmed')
  } finally {
    vi.useRealTimers()
  }
})

it.each([
  { state: 'rejected', delivery: 'returned' },
  { state: 'unknown', delivery: 'unconfirmed' }
] as const)(
  'shows a late $state dispatch even after the send was recorded',
  ({ state, delivery }) => {
    channel = channelFixture()
    channel.messages = [
      {
        id: 'message',
        role: 'user',
        text: 'Please compare',
        createdAt: 1,
        deliveries: { coordinator: 'recorded' },
        deliveryIds: { coordinator: 'delivery' }
      }
    ]
    const submission: AgentJournalSubmission = {
      clientMessageId: 'delivery',
      fence: 1,
      payloadFingerprint: 'fingerprint',
      dispatchState: 'pending',
      providerItemId: null,
      reason: null,
      submittedAt: 1,
      resolvedAt: null
    }
    submissions = [submission]
    const controllers = new Map()
    const view = render(
      <ProjectChannelAgent
        channelId="project"
        member={channel.members[0]}
        controllers={controllers}
      />
    )
    expect(channel.messages[0].deliveries?.coordinator).toBe('recorded')
    submissions = [{ ...submission, dispatchState: state, reason: 'Host restarted', resolvedAt: 2 }]
    view.rerender(
      <ProjectChannelAgent
        channelId="project"
        member={{ ...channel.members[0] }}
        controllers={controllers}
      />
    )
    expect(channel.messages[0].deliveries?.coordinator).toBe(delivery)
  }
)
