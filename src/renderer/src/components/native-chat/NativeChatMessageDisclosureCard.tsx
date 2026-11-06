import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'
import { NativeChatExpandable } from './NativeChatExpandable'
import { NativeChatMessageTimestamp } from './NativeChatMessageTimestamp'

export function NativeChatMessageDisclosureCard({
  disclosureKey,
  avatar,
  heading,
  sender,
  actions,
  timestamp,
  expandable = true,
  expandLabel,
  onRefolded,
  children
}: {
  disclosureKey: string
  avatar: ReactNode
  heading: string
  sender: ReactNode
  actions?: ReactNode
  timestamp: number | null
  expandable?: boolean
  expandLabel?: string
  onRefolded?: () => void
  children: ReactNode
}): React.JSX.Element {
  const disclosure = useNativeChatDisclosure(disclosureKey, false)
  const labelId = useId()
  const bodyId = useId()
  return (
    <div className="group @container w-full rounded-xl border border-border bg-card text-sm text-card-foreground">
      <div
        className="relative flex min-w-0 items-center gap-2 px-3 py-1.5"
        data-state={disclosure.open ? 'open' : 'closed'}
      >
        {expandable ? (
          <button
            type="button"
            aria-label={expandLabel}
            aria-labelledby={expandLabel ? undefined : labelId}
            aria-controls={bodyId}
            aria-expanded={disclosure.open}
            onClick={() => {
              disclosure.setOpen(!disclosure.open)
              if (disclosure.open && onRefolded) {
                requestAnimationFrame(onRefolded)
              }
            }}
            className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        ) : null}
        <div className="pointer-events-none">{avatar}</div>
        <span
          id={labelId}
          className="pointer-events-none max-w-1/3 shrink-0 truncate text-xs text-muted-foreground"
        >
          {heading}
        </span>
        <div className="pointer-events-none relative min-w-0 flex-1 [&_button]:pointer-events-auto">
          {sender}
        </div>
        {actions}
        <div className={cn('pointer-events-none shrink-0', expandable && 'hidden @sm:block')}>
          <NativeChatMessageTimestamp timestamp={timestamp} className="text-muted-foreground" />
        </div>
        {expandable ? (
          <ChevronDown
            aria-hidden
            className={cn(
              'pointer-events-none size-3.5 shrink-0 text-muted-foreground',
              disclosure.open && 'rotate-180'
            )}
          />
        ) : null}
      </div>
      <NativeChatExpandable open={expandable && disclosure.open}>
        <div id={bodyId} className="space-y-2 px-3 pb-3">
          {children}
          <NativeChatMessageTimestamp
            timestamp={timestamp}
            className="text-muted-foreground @sm:hidden"
          />
        </div>
      </NativeChatExpandable>
    </div>
  )
}
