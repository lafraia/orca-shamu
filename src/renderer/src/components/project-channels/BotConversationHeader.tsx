import { Brain, CalendarClock, FolderOpen, LockKeyhole, LockOpen, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ProjectChannel } from '../../../../shared/project-channels'
import { openProjectChannelSource } from './project-channel-candidates'
import { ProjectChannelSettingsButton } from './ProjectChannelSettingsButton'
import { BotAvatar } from './BotAvatar'

export function BotConversationHeader({
  channel,
  ready,
  error,
  onMemory,
  onVault,
  vaultState,
  onRoutines,
  onRetry
}: {
  channel: ProjectChannel
  ready: boolean
  error: string | null
  onMemory: () => void
  onVault: () => void
  vaultState: { unlocked: boolean; pending: number }
  onRoutines: () => void
  onRetry: () => void
}): React.JSX.Element {
  const member = channel.members.find((row) => row.id === channel.home?.memberId)
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
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
        <Button variant="ghost" size="sm" disabled={!ready} onClick={onMemory}>
          <Brain />
          {translate('shamu.memory.button', 'Memory')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!ready}
          onClick={onVault}
          title={vaultState.unlocked ? 'Vault unlocked' : 'Vault locked'}
        >
          {vaultState.unlocked ? <LockOpen /> : <LockKeyhole />}
          {translate('shamu.vault.button', 'Vault')}
          {vaultState.pending ? (
            <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {vaultState.pending}
            </span>
          ) : null}
        </Button>
        <Button variant="ghost" size="sm" disabled={!ready} onClick={onRoutines}>
          <CalendarClock />
          {translate('shamu.routines.button', 'Routines')}
        </Button>
        <ProjectChannelSettingsButton channelId={channel.id} disabled={!ready} />
      </header>
      {error ? (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw />
            {translate('projectChannels.retryConversation', 'Retry')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
