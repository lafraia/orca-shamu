import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { openProjectChannelEditor } from './project-channel-store'

export function ProjectChannelSettingsButton({
  channelId,
  disabled = false
}: {
  channelId: string
  disabled?: boolean
}): React.JSX.Element {
  const label = translate('projectChannels.edit', 'Bot settings')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          onClick={() => openProjectChannelEditor({ channelId })}
        >
          <Settings />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
