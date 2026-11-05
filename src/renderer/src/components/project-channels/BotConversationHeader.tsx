import { Brain, CalendarClock, FolderOpen, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ProjectChannel } from '../../../../shared/project-channels'
import {
  NativeChatSessionOptionPickers,
  type NativeChatSessionOptionPickersProps
} from '../native-chat/NativeChatSessionOptionPickers'
import { openProjectChannelSource } from './project-channel-candidates'
import { ProjectChannelSettingsButton } from './ProjectChannelSettingsButton'
import { BotAvatar } from './BotAvatar'

export function BotConversationHeader({
  channel,
  ready,
  options,
  error,
  onMemory,
  onRoutines,
  onRetry
}: {
  channel: ProjectChannel
  ready: boolean
  options?: NativeChatSessionOptionPickersProps
  error: string | null
  onMemory: () => void
  onRoutines: () => void
  onRetry: () => void
}): React.JSX.Element {
  const member = channel.members.find((row) => row.id === channel.home?.memberId)
  const model = options?.snapshot.find((row) => row.category === 'model')
  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <BotAvatar id={channel.id} identity={channel.identity} />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{channel.name}</h1>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={translate('shamu.bot.model', 'Bot model')}
        >
          {options && model ? (
            <>
              {model.kind.currentValue !== undefined ? (
                <span className="text-xs text-muted-foreground">
                  {translate('components.native-chat.composer.model', 'Model')}
                </span>
              ) : null}
              <NativeChatSessionOptionPickers {...options} />
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled>
              {translate('components.native-chat.composer.model', 'Model')}
            </Button>
          )}
        </div>
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
