import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { defaultBotIdentity, type BotIdentity } from '../../../../shared/bot-identity'
import { observeOffscreenAnimation } from '@/lib/offscreen-animation-pause'
import { BotBlob } from './BotBlob'

export function BotAvatar({
  id,
  identity,
  activity,
  className
}: {
  id: string
  identity?: BotIdentity
  activity?: 'idle' | 'working' | 'waiting'
  className?: string
}): React.JSX.Element {
  const appearance = identity ?? defaultBotIdentity(id)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const style: CSSProperties & { '--bot-identity-color': string } = {
    '--bot-identity-color': `var(--bot-identity-${appearance.color})`
  }
  return (
    <span
      aria-hidden="true"
      ref={observeOffscreenAnimation}
      style={style}
      data-animated={appearance.animated}
      className={cn(
        'bot-avatar inline-flex size-8 shrink-0 items-center justify-center',
        className
      )}
    >
      {appearance.image && failedImage !== appearance.image ? (
        <img
          src={appearance.image}
          alt=""
          className="size-full rounded-full object-cover"
          onError={() => setFailedImage(appearance.image!)}
        />
      ) : (
        <BotBlob identity={appearance} activity={activity} />
      )}
    </span>
  )
}
