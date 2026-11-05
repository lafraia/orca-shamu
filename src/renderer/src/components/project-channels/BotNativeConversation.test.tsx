// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelFixture } from '../../../../shared/project-channels.test-fixture'
import { BotNativeConversation } from './BotNativeConversation'

const { ensure } = vi.hoisted(() => ({ ensure: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./project-channel-store', () => ({ ensureProjectChannelConversation: ensure }))
vi.mock('../native-chat/NativeChatView', () => ({ default: () => <div>Native chat</div> }))
vi.mock('./ProjectChannelSettingsButton', () => ({ ProjectChannelSettingsButton: () => null }))
vi.mock('./BotMemoryPanel', () => ({ BotMemoryPanel: () => null }))

describe('bot conversation provisioning', () => {
  beforeEach(() => ensure.mockClear())
  afterEach(cleanup)
  it('does not continuously re-provision a bot when snapshot reads return a fresh identity object', () => {
    const channel = { ...channelFixture(), identity: { color: 'blue' as const, animated: true } }
    const { rerender } = render(<BotNativeConversation channel={channel} />)
    expect(ensure).toHaveBeenCalledTimes(1)
    rerender(<BotNativeConversation channel={{ ...channel, identity: { ...channel.identity } }} />)
    expect(ensure).toHaveBeenCalledTimes(1)
    rerender(
      <BotNativeConversation
        channel={{ ...channel, identity: { ...channel.identity, color: 'teal' } }}
      />
    )
    expect(ensure).toHaveBeenCalledTimes(2)
  })
})
