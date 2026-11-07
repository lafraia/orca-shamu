import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { MouseEventHandler } from 'react'
import './native-chat-inline-highlight.css'

export function NativeChatPromptPill({
  icon: Icon,
  label,
  selected,
  variant = 'promptPill',
  onClick,
  ariaLabel,
  ...badgeProps
}: {
  icon: LucideIcon
  label: string
  selected: boolean
  variant?: 'promptPill' | 'inlineReference'
  onClick?: MouseEventHandler<HTMLButtonElement>
  ariaLabel?: string
  title?: string
}): React.JSX.Element {
  if (onClick) {
    return (
      <Badge variant={variant} data-selected={selected} asChild {...badgeProps}>
        <button type="button" aria-label={ariaLabel} onClick={onClick}>
          <Icon aria-hidden="true" />
          <span className="truncate">{label}</span>
        </button>
      </Badge>
    )
  }
  return (
    <Badge variant={variant} data-selected={selected} {...badgeProps}>
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Badge>
  )
}
