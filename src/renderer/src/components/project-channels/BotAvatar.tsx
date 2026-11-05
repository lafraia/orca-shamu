import { useState, type CSSProperties } from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { defaultBotIdentity, type BotIdentity } from '../../../../shared/bot-identity'

export function BotAvatar({
  id,
  identity,
  className
}: {
  id: string
  identity?: BotIdentity
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
      style={style}
      data-animated={appearance.animated}
      className={cn(
        'bot-avatar inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl',
        className
      )}
    >
      {appearance.image && failedImage !== appearance.image ? (
        <img
          src={appearance.image}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedImage(appearance.image!)}
        />
      ) : (
        <Bot className="bot-avatar-face size-3/5" />
      )}
    </span>
  )
}
