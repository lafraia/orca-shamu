import { Bot, Layers, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { BotSidebarGroups } from './BotSidebarGroups'
import { BotUnreadBadge } from './BotUnreadBadge'
import { botUnreadDescription, useBotUnread } from './bot-unread-store'
import {
  openProjectChannelEditor,
  reloadProjectChannels,
  useProjectChannels
} from './project-channel-store'

export function ProjectNavigationSwitch(): React.JSX.Element | null {
  const mode = useProjectChannels((state) => state.mode)
  const counts = useBotUnread((state) => state.counts)
  const pending = useBotUnread((state) => state.pending.length > 0)
  const count = Object.values(counts).reduce((sum, value) => sum + value, 0)
  if (!window.api.projectChannels) {
    return null
  }
  return (
    <div
      className="mx-2 mt-2 flex shrink-0 gap-1 rounded-md bg-worktree-sidebar-foreground/5 p-1"
      role="group"
      aria-label={translate('projectChannels.navigation', 'Navigation')}
    >
      <Button
        variant={mode === 'projects' ? 'secondary' : 'ghost'}
        size="xs"
        className="flex-1"
        aria-pressed={mode === 'projects'}
        aria-description={botUnreadDescription(count, pending)}
        onClick={() => {
          useProjectChannels.setState({ mode: 'projects' })
          useAppStore.setState({ activeView: 'project-chat' })
        }}
      >
        <Bot />
        {translate('projectChannels.projects', 'Bots')}
        <BotUnreadBadge count={count} pending={pending} />
      </Button>
      <Button
        variant={mode === 'workspaces' ? 'secondary' : 'ghost'}
        size="xs"
        className="flex-1"
        aria-pressed={mode === 'workspaces'}
        onClick={() => {
          useProjectChannels.setState({ mode: 'workspaces' })
          if (useAppStore.getState().activeView === 'project-chat') {
            useAppStore.setState({ activeView: 'terminal' })
          }
        }}
      >
        <Layers />
        {translate('projectChannels.workspaces', 'Workspaces')}
      </Button>
    </div>
  )
}

export function ProjectChannelSidebar(): React.JSX.Element {
  const snapshot = useProjectChannels((state) => state.snapshot)
  const selectedId = useProjectChannels((state) => state.selectedId)
  const loaded = useProjectChannels((state) => state.loaded)
  const error = useProjectChannels((state) => state.error)
  const activeView = useAppStore((state) => state.activeView)
  const [search, setSearch] = useState('')
  const channels = snapshot.channels.filter((channel) =>
    channel.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  )
  return (
    <nav
      aria-label={translate('projectChannels.projects', 'Bots')}
      className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <Input
          aria-label={translate('projectChannels.search', 'Find bot')}
          placeholder={translate('projectChannels.search', 'Find bot')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          density="compact"
          className="min-w-0"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('projectChannels.new', 'New bot')}
          onClick={() => openProjectChannelEditor({})}
        >
          <Plus />
        </Button>
      </div>
      {error ? (
        <div role="alert" className="space-y-2 p-2 text-xs text-destructive">
          {error}
          <Button variant="outline" size="xs" onClick={() => void reloadProjectChannels()}>
            {translate('projectChannels.reload', 'Reload bots')}
          </Button>
        </div>
      ) : null}
      {!loaded && !error ? (
        <div
          aria-busy="true"
          aria-label={translate('projectChannels.loading', 'Loading bots')}
          className="space-y-2 px-2 py-3"
        >
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-7 rounded bg-worktree-sidebar-foreground/5" />
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <BotSidebarGroups
          channels={channels}
          sections={[
            ...new Set(
              snapshot.channels
                .map((row) => row.section)
                .filter((section): section is string => Boolean(section))
            )
          ]}
          selectedId={selectedId}
          active={activeView === 'project-chat'}
        />
        {loaded && channels.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">
            {search ? (
              translate('projectChannels.noResults', 'No bots found')
            ) : (
              <Button variant="outline" size="sm" onClick={() => openProjectChannelEditor({})}>
                <Plus />
                {translate('projectChannels.new', 'New bot')}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 justify-start"
        onClick={() => useAppStore.setState({ activeView: 'settings' })}
      >
        <Settings2 />
        {translate('projectChannels.settings', 'Settings')}
      </Button>
    </nav>
  )
}
