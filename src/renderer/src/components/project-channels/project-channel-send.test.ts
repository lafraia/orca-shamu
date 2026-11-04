// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'
import type {
  ProjectChannelsApi,
  ProjectChannelsSnapshot
} from '../../../../shared/project-channels'
const mocks = vi.hoisted(() => ({ available: true, reserve: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('./project-channel-candidates', () => ({
  availableProjectChannelMember: () => mocks.available
}))
vi.mock('../native-chat/structured-agent-session-message-sender', () => ({
  reserveStructuredAgentSessionSend: mocks.reserve
}))
import {
  changeProjectChannel,
  reloadProjectChannels,
  setProjectChannelDraft,
  useProjectChannels
} from './project-channel-store'
import {
  sendProjectChannelMessage,
  type ProjectChannelController,
  type ProjectChannelControllers
} from './project-channel-send'

describe('shared channel send admission', () => {
  let api: ProjectChannelsApi
  let controllers: ProjectChannelControllers
  beforeEach(() => {
    mocks.available = true
    mocks.reserve.mockReset()
    const channel = channelFixture()
    channel.members.forEach((member) => {
      member.historyImported = true
    })
    useProjectChannels.setState({
      snapshot: { version: 1, revision: 0, channels: [channel] },
      loaded: true,
      drafts: {},
      draftEpoch: useProjectChannels.getState().draftEpoch + 1,
      error: null
    })
    api = {
      read: vi.fn(),
      ensureConversation: vi.fn(),
      write: vi.fn(async (snapshot) => ({ ...snapshot, revision: snapshot.revision + 1 }))
    }
    Object.defineProperty(window, 'api', { configurable: true, value: { projectChannels: api } })
    controllers = new Map(
      channel.members.map((member) => [
        member.id,
        (): ProjectChannelController => ({
          status: 'ready',
          readCurrent: true,
          isWorking: false,
          sendOut: false,
          prompts: []
        })
      ])
    )
    mocks.reserve.mockImplementation(({ sessionId }: { sessionId: string }) => ({
      clientMessageId: `operation-${sessionId}`,
      release: vi.fn(),
      send: vi.fn(() => ({ outcome: Promise.resolve('recorded') }))
    }))
  })
  afterEach(async () => {
    await changeProjectChannel('project', (channel) => channel).catch(() => {})
  })

  it('preserves the draft without recording or dispatching a turn for an unlinked bot', async () => {
    const channel = {
      ...channelFixture(),
      mainMemberId: null,
      members: [],
      draft: 'Keep this draft'
    }
    useProjectChannels.setState({
      snapshot: { version: 1, revision: 0, channels: [channel] },
      drafts: { project: channel.draft }
    })
    await expect(sendProjectChannelMessage('project', channel.draft, controllers)).rejects.toThrow(
      'Link an agent conversation'
    )
    expect(api.write).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(useProjectChannels.getState().drafts.project).toBe(channel.draft)
    expect(useProjectChannels.getState().snapshot.channels[0].messages).toEqual([])
  })

  it('records the user message and stable delivery ids before issuing any prompt', async () => {
    let finish!: (snapshot: ProjectChannelsSnapshot) => void
    vi.mocked(api.write).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const send = sendProjectChannelMessage('project', '@researcher Please compare', controllers)
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledOnce())
    const reservation = mocks.reserve.mock.results[0].value
    expect(reservation.send).not.toHaveBeenCalled()
    const saved = vi.mocked(api.write).mock.calls[0][0]
    expect(saved.channels[0].messages[0]).toMatchObject({
      text: '@researcher Please compare',
      deliveryIds: { researcher: 'operation-session-researcher' }
    })
    finish({ ...saved, revision: 1 })
    await send
    expect(reservation.send).toHaveBeenCalledOnce()
    expect(mocks.reserve.mock.calls[0][0].sessionId).toBe('session-researcher')
  })

  it('consumes the draft before a slow save and never restores it after a view switch', async () => {
    let finish!: (snapshot: ProjectChannelsSnapshot) => void
    vi.mocked(api.write).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    setProjectChannelDraft('project', 'SEND ONCE')
    const pending = sendProjectChannelMessage('project', 'SEND ONCE', controllers)
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledOnce())
    useProjectChannels.setState({ selectedId: null })
    expect(useProjectChannels.getState().drafts.project).toBe('')
    const saved = vi.mocked(api.write).mock.calls[0][0]
    finish({ ...saved, revision: 1 })
    await pending
    await changeProjectChannel('project', (channel) => channel)
    expect(useProjectChannels.getState().snapshot.channels[0].draft).toBe('')
    expect(useProjectChannels.getState().snapshot.channels[0].messages).toHaveLength(1)
  })

  it('replaces the input draft on explicit reload and discards stale save timers', async () => {
    setProjectChannelDraft('project', 'STALE LOCAL DRAFT')
    const snapshot = useProjectChannels.getState().snapshot
    const channels = snapshot.channels.map((channel) => ({
      ...channel,
      draft: 'NEW DRAFT SAVED ELSEWHERE'
    }))
    vi.mocked(api.read).mockResolvedValue({ ...snapshot, revision: 50, channels })
    await reloadProjectChannels()
    expect(useProjectChannels.getState().drafts.project).toBe('NEW DRAFT SAVED ELSEWHERE')
    expect(useProjectChannels.getState().snapshot.channels[0].draft).toBe(
      'NEW DRAFT SAVED ELSEWHERE'
    )
    expect(api.write).not.toHaveBeenCalled()
  })

  it('releases reservations without sending when the durable save fails', async () => {
    vi.mocked(api.write).mockRejectedValueOnce(new Error('Disk full'))
    await expect(sendProjectChannelMessage('project', 'Hello', controllers)).rejects.toThrow(
      'Could not save'
    )
    const reservation = mocks.reserve.mock.results[0].value
    expect(reservation.release).toHaveBeenCalledOnce()
    expect(reservation.send).not.toHaveBeenCalled()
  })

  it('never routes to a missing source, an uninitialised participant or an unknown mention', async () => {
    mocks.available = false
    await expect(sendProjectChannelMessage('project', 'Hello', controllers)).rejects.toThrow(
      'original chat'
    )
    mocks.available = true
    await expect(
      sendProjectChannelMessage('project', '@missing Hello', controllers)
    ).rejects.toThrow('Link @missing')
    await changeProjectChannel('project', (channel) => ({
      ...channel,
      members: channel.members.map((member) => ({ ...member, historyImported: false }))
    }))
    vi.mocked(api.write).mockClear()
    await expect(sendProjectChannelMessage('project', 'Hello', controllers)).rejects.toThrow(
      'original chat'
    )
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(api.write).not.toHaveBeenCalled()
  })

  it('keeps an uncertain delivery and does not retry it', async () => {
    const issue = vi.fn(() => ({ outcome: Promise.resolve('unconfirmed') }))
    mocks.reserve.mockReturnValue({ clientMessageId: 'uncertain', release: vi.fn(), send: issue })
    await sendProjectChannelMessage('project', 'Hello', controllers)
    await changeProjectChannel('project', (channel) => channel)
    expect(issue).toHaveBeenCalledOnce()
    expect(useProjectChannels.getState().snapshot.channels[0].messages[0].deliveries).toEqual({
      coordinator: 'unconfirmed'
    })
  })

  it('keeps a journal rejection when the earlier transport acknowledgement arrives late', async () => {
    let acknowledge!: (outcome: 'recorded') => void
    const issue = vi.fn(() => ({
      outcome: new Promise<'recorded'>((resolve) => {
        acknowledge = resolve
      })
    }))
    mocks.reserve.mockReturnValue({ clientMessageId: 'late', release: vi.fn(), send: issue })
    await sendProjectChannelMessage('project', 'Hello', controllers)
    await changeProjectChannel('project', (channel) => ({
      ...channel,
      messages: channel.messages.map((message) => ({
        ...message,
        deliveries: { coordinator: 'returned' }
      }))
    }))
    acknowledge('recorded')
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledTimes(3))
    expect(useProjectChannels.getState().snapshot.channels[0].messages[0].deliveries).toEqual({
      coordinator: 'returned'
    })
    expect(issue).toHaveBeenCalledOnce()
  })
})
