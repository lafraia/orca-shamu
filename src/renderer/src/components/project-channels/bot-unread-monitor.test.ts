// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'

const mocks = vi.hoisted(() => ({
  viewed: false,
  read: vi.fn(),
  mark: vi.fn(),
  activate: vi.fn(),
  owner: vi.fn(),
  feed: new Map(),
  notify: () => {},
  finish: (_sessionId: string) => {}
}))
vi.mock('@/store', () => ({ useAppStore: { subscribe: () => () => {} } }))
vi.mock('./project-channel-store', () => ({ useProjectChannels: { subscribe: () => () => {} } }))
vi.mock('./bot-read-visibility', () => ({ isBotChatViewed: () => mocks.viewed }))
vi.mock('@/attention/agent-subject-read-actions', () => ({
  subscribeStructuredAttentionViews: () => () => {}
}))
vi.mock('@/hooks/agent-auto-ack-presence', () => ({
  subscribeAutoAckPresenceSignals: () => () => {}
}))
vi.mock('../native-chat/structured-agent-session-read-owner', () => ({
  findStructuredAgentSessionReadOwner: mocks.owner
}))
vi.mock('@/runtime/structured-agent-session-status-feed', () => ({
  getStructuredAgentSessionStatusFeed: () => ({
    activate: mocks.activate,
    getSnapshot: () => mocks.feed,
    getSessionObservation: () => 'live',
    subscribe: (notify: () => void) => {
      mocks.notify = notify
      return () => {}
    }
  })
}))
vi.mock('@/runtime/structured-agent-session-turn-completion-feed', () => ({
  getStructuredAgentSessionTurnCompletionFeed: () => ({
    activate: mocks.activate,
    subscribe: (
      listener: (edge: { type: 'completion'; completion: { sessionId: string } }) => void
    ) => {
      mocks.finish = (sessionId: string) =>
        listener({ type: 'completion', completion: { sessionId } })
      return () => {}
    }
  })
}))
import { startBotUnreadMonitor } from './bot-unread-monitor'
import { useBotUnread } from './bot-unread-store'

describe('bot badge background reads', () => {
  const stops: (() => void)[] = []
  const channel = channelFixture()
  channel.home = {
    directory: '/bot',
    memberId: channel.members[0].id,
    ready: true,
    createOperationId: 'create',
    createFingerprint: 'fingerprint'
  }
  channel.members[0].target = { kind: 'environment', environmentId: 'primary' }
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.viewed = false
    mocks.feed.clear()
    mocks.read.mockReset().mockResolvedValue({ counts: { [channel.id]: 2 }, pending: [] })
    mocks.mark.mockReset()
    mocks.activate.mockReset().mockReturnValue(() => {})
    mocks.owner.mockReset().mockReturnValue({
      getSnapshot: () => ({ current: true, state: { cursor: { epoch: 'epoch', sequence: 3 } } })
    })
    useBotUnread.setState({ counts: {}, pending: [], openChatId: null })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { projectChannels: { readUnread: mocks.read, markRead: mocks.mark } }
    })
  })
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop())
    vi.useRealTimers()
  })
  it('uses the shared status feed without polling an idle bot or hydrating its transcript', async () => {
    stops.push(startBotUnreadMonitor([channel]))
    await vi.advanceTimersByTimeAsync(500)
    expect(useBotUnread.getState().counts[channel.id]).toBe(2)
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(mocks.owner).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })
  it('retains the count after a failed acknowledgement without retrying in a hot loop', async () => {
    mocks.viewed = true
    mocks.mark.mockRejectedValue(new Error('Primary offline'))
    stops.push(startBotUnreadMonitor([channel]))
    await vi.advanceTimersByTimeAsync(500)
    const attempts = mocks.mark.mock.calls.length
    expect(attempts).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.mark).toHaveBeenCalledTimes(attempts)
    expect(useBotUnread.getState().counts[channel.id]).toBe(2)
  })
  it('removes the aggregate badge when the last bot is removed', () => {
    useBotUnread.setState({ counts: { old: 3 }, pending: [] })
    stops.push(startBotUnreadMonitor([]))
    expect(useBotUnread.getState().counts).toEqual({})
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it('refreshes a completed reply even while background work keeps the status working', async () => {
    const sessionId = channel.members[0].sessionId
    mocks.feed.set(sessionId, { status: 'working', updatedAt: 1 })
    stops.push(startBotUnreadMonitor([channel]))
    await vi.advanceTimersByTimeAsync(500)
    mocks.feed.set(sessionId, { status: 'working', updatedAt: 2 })
    mocks.notify()
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.read).toHaveBeenCalledTimes(1)
    mocks.finish(sessionId)
    await vi.advanceTimersByTimeAsync(500)
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })
})
