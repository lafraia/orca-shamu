import { useEffect, useState } from 'react'
import { Bot, Brain, CalendarClock, FolderOpen, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import NativeChatView from '../native-chat/NativeChatView'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { openProjectChannelSource } from './project-channel-candidates'
import { ensureProjectChannelConversation } from './project-channel-store'
import { ProjectChannelSettingsButton } from './ProjectChannelSettingsButton'
import { BotAvatar } from './BotAvatar'
import { BotMemoryPanel } from './BotMemoryPanel'
import { BotRoutinesPanel } from './BotRoutinesPanel'

export function BotNativeConversation({ channel }: { channel: ProjectChannel }): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const member = channel.members.find((row) => row.id === channel.home?.memberId)
  const ready = channel.home?.ready && member
  useEffect(() => {
    let current = true
    setError(null)
    void ensureProjectChannelConversation(channel.id).catch((failure: unknown) => {
      if (current) {
        setError(
          failure instanceof Error ? failure.message : 'Could not open this bot conversation.'
        )
      }
    })
    return () => {
      current = false
    }
  }, [
    channel.id,
    channel.name,
    channel.instructions,
    channel.identity?.color,
    channel.identity?.animated,
    channel.identity?.image,
    attempt
  ])
  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label={channel.name}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <BotAvatar id={channel.id} identity={channel.identity} />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{channel.name}</h1>
        <Button
          variant="ghost"
          size="sm"
          disabled={!ready}
          onClick={() => member && openProjectChannelSource(member)}
        >
          <FolderOpen />
          {translate('projectChannels.openWorkspace', 'Workspace')}
        </Button>
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setMemoryOpen(true)}>
          <Brain />
          {translate('shamu.memory.button', 'Memory')}
        </Button>
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setRoutinesOpen(true)}>
          <CalendarClock />
          {translate('shamu.routines.button', 'Routines')}
        </Button>
        <ProjectChannelSettingsButton channelId={channel.id} disabled={!ready} />
      </header>
      {routinesOpen ? (
        <BotRoutinesPanel
          botId={channel.id}
          name={channel.name}
          onClose={() => setRoutinesOpen(false)}
        />
      ) : null}
      {memoryOpen ? (
        <BotMemoryPanel channel={channel} open={memoryOpen} onOpenChange={setMemoryOpen} />
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            <RotateCcw />
            {translate('projectChannels.retryConversation', 'Retry')}
          </Button>
        </div>
      ) : null}
      {ready ? (
        <NativeChatView
          mode="structured"
          tabId={member.tabId}
          sessionId={member.sessionId}
          target={member.target}
          agent={member.agent}
          isVisible
          isFocusedGroup
        />
      ) : (
        <div aria-busy={!error} className="flex min-h-0 flex-1 flex-col px-5 py-5">
          <div className="mx-auto w-full max-w-(--chat-content-max-width) flex-1 space-y-3 py-12">
            <Bot className="size-7 text-muted-foreground" />
            <h2 className="text-lg font-medium">
              {translate(
                'projectChannels.preparingConversation',
                'Preparing your bot conversation'
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {translate(
                'projectChannels.preparingWorkspace',
                'Creating a dedicated workspace and a chat that stays with this bot when you reopen Shamu.'
              )}
            </p>
            {channel.instructions ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {channel.instructions}
              </p>
            ) : null}
          </div>
          <div
            aria-hidden="true"
            className="mx-auto w-full max-w-(--chat-content-max-width) rounded-xl border border-border p-4"
          >
            <div className="mb-8 h-3 w-36 rounded bg-muted" />
            <div className="h-5 w-24 rounded bg-muted" />
          </div>
        </div>
      )}
    </section>
  )
}
