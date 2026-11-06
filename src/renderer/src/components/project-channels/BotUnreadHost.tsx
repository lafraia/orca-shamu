import { useEffect } from 'react'
import { useProjectChannels } from './project-channel-store'
import { startBotUnreadMonitor } from './bot-unread-monitor'

export function BotUnreadHost(): null {
  const channels = useProjectChannels((state) => state.snapshot.channels)
  const loaded = useProjectChannels((state) => state.loaded)
  useEffect(() => (loaded ? startBotUnreadMonitor(channels) : undefined), [channels, loaded])
  return null
}
