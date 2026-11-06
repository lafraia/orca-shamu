import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import NativeChatView from '../native-chat/NativeChatView'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { ensureProjectChannelConversation } from './project-channel-store'
import { BotConversationHeader } from './BotConversationHeader'
import { BotMemoryPanel } from './BotMemoryPanel'
import { BotRoutinesPanel } from './BotRoutinesPanel'
import { VaultPanel } from './vault/VaultPanel'
import { useBotUnread } from './bot-unread-store'

export function BotNativeConversation({ channel }: { channel: ProjectChannel }): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [vaultState, setVaultState] = useState({ unlocked: false, pending: 0 })
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const member = channel.members.find((row) => row.id === channel.home?.memberId)
  const ready = channel.home?.ready && member
  const hasConversation = Boolean(ready)
  useEffect(() => {
    const api = window.api.projectChannels?.vault
    if (!api || !hasConversation) {
      return
    }
    let current = true
    let changed = false
    const unsubscribe = api.onChanged((change) => {
      changed = true
      setVaultState({
        unlocked: change.unlocked,
        pending: change.pendingBotIds.filter((id) => id === channel.id).length
      })
    })
    void api
      .status(channel.id)
      .then((snapshot) => {
        if (current && !changed) {
          setVaultState({
            unlocked: snapshot.state === 'unlocked',
            pending: snapshot.requests.filter((row) => row.state === 'pending').length
          })
        }
      })
      .catch(() => {})
    return () => {
      current = false
      unsubscribe()
    }
  }, [channel.id, hasConversation])
  useEffect(() => {
    if (!hasConversation || memoryOpen || routinesOpen || vaultOpen) {
      return
    }
    useBotUnread.setState({ openChatId: channel.id })
    return () => {
      if (useBotUnread.getState().openChatId === channel.id) {
        useBotUnread.setState({ openChatId: null })
      }
    }
  }, [channel.id, hasConversation, memoryOpen, routinesOpen, vaultOpen])
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
  const header = (
    <BotConversationHeader
      channel={channel}
      ready={Boolean(ready)}
      error={error}
      onMemory={() => setMemoryOpen(true)}
      onVault={() => setVaultOpen(true)}
      vaultState={vaultState}
      onRoutines={() => setRoutinesOpen(true)}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label={channel.name}
    >
      {header}
      <VaultPanel
        botId={channel.id}
        name={channel.name}
        open={vaultOpen}
        onOpenChange={setVaultOpen}
      />
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
