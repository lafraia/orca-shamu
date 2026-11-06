import { Bot, ChevronDown, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { BotSidebarGroups } from './BotSidebarGroups'
import { botSectionNames } from '../../../../shared/bot-sections'
import { useShamuClient } from '../shamu/shamu-client-state'
import {
  openProjectChannelEditor,
  reloadProjectChannels,
  useProjectChannels
} from './project-channel-store'

export function ProjectChannelSidebar(): React.JSX.Element | null {
  const enabled = useShamuClient((state) => state.enabled)
  const snapshot = useProjectChannels((state) => state.snapshot)
  const selectedId = useProjectChannels((state) => state.selectedId)
  const loaded = useProjectChannels((state) => state.loaded)
  const error = useProjectChannels((state) => state.error)
  const expanded = useProjectChannels((state) => state.sidebarExpanded)
  const active = useAppStore((state) => state.activeView === 'project-chat')
  if (!enabled || !window.api?.projectChannels) {
    return null
  }
  const channels = snapshot.channels
  const newBotLabel = translate('projectChannels.new', 'New bot')
  return (
    <div className="shrink-0 px-2 pb-1">
      <Collapsible
        open={expanded}
        onOpenChange={(sidebarExpanded) => useProjectChannels.setState({ sidebarExpanded })}
      >
        <div
          className={cn(
            'group flex items-center rounded-md text-[13px] font-medium tracking-tight',
            active
              ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
              : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bot className="size-4 shrink-0" />
              <span className="flex-1">{translate('projectChannels.projects', 'Bots')}</span>
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-(--duration-fast) motion-reduce:transition-none',
                  !expanded && '-rotate-90'
                )}
              />
            </button>
          </CollapsibleTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="mr-1"
                aria-label={newBotLabel}
                onClick={() => openProjectChannelEditor({})}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{newBotLabel}</TooltipContent>
          </Tooltip>
        </div>
        <CollapsibleContent animation="height">
          <nav
            aria-label={translate('projectChannels.projects', 'Bots')}
            className="max-h-[min(20rem,35vh)] overflow-y-auto worktree-sidebar-scrollbar pt-1 pl-4"
          >
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
                {[0, 1].map((key) => (
                  <div key={key} className="h-7 rounded bg-worktree-sidebar-foreground/5" />
                ))}
              </div>
            ) : null}
            <BotSidebarGroups
              channels={channels}
              sections={botSectionNames(snapshot.channels, snapshot.sectionOrder).filter(Boolean)}
              sectionOrder={botSectionNames(
                snapshot.channels.filter((row) => !row.pinned),
                snapshot.sectionOrder
              )}
              selectedId={selectedId}
              active={active}
            />
            {loaded && channels.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                <Button variant="ghost" size="xs" onClick={() => openProjectChannelEditor({})}>
                  <Plus />
                  {newBotLabel}
                </Button>
              </div>
            ) : null}
          </nav>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
