import { Hash, Layers, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  openProjectChannel,
  openProjectChannelEditor,
  reloadProjectChannels,
  useProjectChannels
} from './project-channel-store'

export function ProjectNavigationSwitch(): React.JSX.Element | null {
  const mode = useProjectChannels((state) => state.mode)
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
        onClick={() => {
          useProjectChannels.setState({ mode: 'projects' })
          useAppStore.setState({ activeView: 'project-chat' })
        }}
      >
        <Hash />
        {translate('projectChannels.projects', 'Projects')}
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
      aria-label={translate('projectChannels.projects', 'Projects')}
      className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <Input
          aria-label={translate('projectChannels.search', 'Find project')}
          placeholder={translate('projectChannels.search', 'Find project')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          density="compact"
          className="min-w-0"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('projectChannels.new', 'New project')}
          onClick={() => openProjectChannelEditor({})}
        >
          <Plus />
        </Button>
      </div>
      {error ? (
        <div role="alert" className="space-y-2 p-2 text-xs text-destructive">
          {error}
          <Button variant="outline" size="xs" onClick={() => void reloadProjectChannels()}>
            {translate('projectChannels.reload', 'Reload projects')}
          </Button>
        </div>
      ) : null}
      {!loaded && !error ? (
        <div
          aria-busy="true"
          aria-label={translate('projectChannels.loading', 'Loading projects')}
          className="space-y-2 px-2 py-3"
        >
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-7 rounded bg-worktree-sidebar-foreground/5" />
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            data-current={activeView === 'project-chat' && channel.id === selectedId}
            aria-current={
              activeView === 'project-chat' && channel.id === selectedId ? 'page' : undefined
            }
            onClick={() => openProjectChannel(channel.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activeView === 'project-chat' &&
                channel.id === selectedId &&
                'bg-worktree-sidebar-accent'
            )}
          >
            <Hash className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{channel.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {channel.members.length}
            </span>
          </button>
        ))}
        {loaded && channels.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">
            {search ? (
              translate('projectChannels.noResults', 'No projects found')
            ) : (
              <Button variant="outline" size="sm" onClick={() => openProjectChannelEditor({})}>
                <Plus />
                {translate('projectChannels.new', 'New project')}
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
