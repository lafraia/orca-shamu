import { Link2, Unlink } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from '../status-bar/status-bar-context-menu-policy'
import { useShamuConnection } from './use-shamu-connection'

export function ShamuStatusSegment({
  iconOnly = false
}: {
  iconOnly?: boolean
}): React.JSX.Element | null {
  const connection = useShamuConnection()
  if (!connection.enabled) {
    return null
  }
  const status = connection.live
    ? translate('shamu.connected', 'Connected')
    : translate('shamu.disconnected', 'Disconnected')
  const label = `${translate('shamu.primary', 'Primary Orca')} ${status}`
  const Icon = connection.live ? Link2 : Unlink
  const control = (
    <button
      type="button"
      {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
      className="inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
      aria-label={label}
      onClick={() => {
        const state = useAppStore.getState()
        state.openSettingsTarget({ pane: 'orca-shamu', repoId: null, hostScope: { kind: 'local' } })
        state.openSettingsPage()
      }}
    >
      <Icon className="size-3" />
      <span role="status" className={iconOnly ? 'sr-only' : undefined}>
        {label}
      </span>
      {import.meta.env.DEV && !iconOnly ? <span>Live reload</span> : null}
    </button>
  )
  return iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  ) : (
    control
  )
}
