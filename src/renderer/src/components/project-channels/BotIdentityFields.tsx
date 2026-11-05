import { useRef, useState } from 'react'
import { Check, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { BOT_COLORS, type BotIdentity } from '../../../../shared/bot-identity'
import { BotAvatar } from './BotAvatar'
import { readBotAvatar } from './bot-avatar-upload'

export function BotIdentityFields({
  id,
  value,
  onChange,
  onBusyChange
}: {
  id: string
  value: BotIdentity
  onChange: (value: BotIdentity) => void
  onBusyChange?: (busy: boolean) => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-3">
      <Label>{translate('shamu.bots.identity', 'Identity')}</Label>
      <div className="flex items-center gap-4">
        <BotAvatar id={id} identity={value} className="size-16 rounded-2xl" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus />
              {translate('shamu.bots.chooseImage', 'Choose image')}
            </Button>
            {value.image ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ color: value.color, animated: value.animated })}
              >
                {translate('shamu.bots.useIcon', 'Use bot icon')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'shamu.bots.imageHint',
              'Square crop. Animated images use their first frame.'
            )}
          </p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label={translate('shamu.bots.avatarImage', 'Bot image')}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) {
            return
          }
          setError(null)
          setBusy(true)
          onBusyChange?.(true)
          void readBotAvatar(file)
            .then((image) => onChange({ ...value, image }))
            .catch((failure: unknown) =>
              setError(failure instanceof Error ? failure.message : 'Could not read this image.')
            )
            .finally(() => {
              setBusy(false)
              onBusyChange?.(false)
            })
        }}
      />
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={translate('shamu.bots.color', 'Bot color')}
      >
        {BOT_COLORS.map((color) => (
          <Button
            key={color}
            type="button"
            variant="outline"
            size="icon-xs"
            disabled={busy}
            aria-label={translate(`shamu.bots.color.${color}`, color)}
            aria-pressed={value.color === color}
            onClick={() => onChange({ ...value, color })}
            style={{ color: `var(--bot-identity-${color})` }}
          >
            {value.color === color ? (
              <Check className="size-3.5" />
            ) : (
              <span className="size-3 rounded-full bg-current" />
            )}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="bot-animated-avatar"
          checked={value.animated}
          disabled={busy}
          onCheckedChange={(animated) => onChange({ ...value, animated })}
        />
        <Label htmlFor="bot-animated-avatar">
          {translate('shamu.bots.animate', 'Animate bot icon')}
        </Label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
