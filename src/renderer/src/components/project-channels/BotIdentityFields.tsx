import { useRef, useState } from 'react'
import { Check, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import {
  BOT_COLORS,
  BOT_EXPRESSIONS,
  BOT_SHAPES,
  type BotIdentity
} from '../../../../shared/bot-identity'
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
  const upload = (file: File): void => {
    if (busy) {
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
  }
  return (
    <div className="space-y-3">
      <Label>{translate('shamu.bots.identity', 'Identity')}</Label>
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-20"
          disabled={busy}
          aria-label={translate('shamu.bots.changePhoto', 'Change bot photo')}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files[0]
            if (file) {
              upload(file)
            }
          }}
        >
          <BotAvatar id={id} identity={value} activity="working" className="size-16" />
        </Button>
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
              {translate('shamu.bots.uploadPhoto', 'Upload photo')}
            </Button>
            {value.image ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onChange({ ...value, image: undefined })}
              >
                {translate('shamu.bots.useAvatar', 'Use animated avatar')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'shamu.bots.photoHint',
              'Drop a photo here or upload PNG, JPEG, WebP or GIF up to 5 MB. Photos use a circular crop.'
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
          upload(file)
        }}
      />
      {!value.image ? (
        <>
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {translate('shamu.bots.shape', 'Shape')}
            </legend>
            <div className="flex gap-2">
              {BOT_SHAPES.map((shape) => (
                <Button
                  key={shape}
                  type="button"
                  size="icon-lg"
                  variant={shape === (value.shape ?? 'circle') ? 'secondary' : 'outline'}
                  aria-label={translate(`shamu.bots.shape.${shape}`, shape)}
                  aria-pressed={shape === (value.shape ?? 'circle')}
                  onClick={() => onChange({ ...value, shape })}
                  disabled={busy}
                >
                  <BotAvatar
                    id={id}
                    identity={{ ...value, shape, animated: false }}
                    className="size-7"
                  />
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {translate('shamu.bots.expression', 'Expression')}
            </legend>
            <div className="flex gap-2">
              {BOT_EXPRESSIONS.map((expression) => (
                <Button
                  key={expression}
                  type="button"
                  size="sm"
                  variant={expression === (value.expression ?? 'calm') ? 'secondary' : 'outline'}
                  aria-pressed={expression === (value.expression ?? 'calm')}
                  disabled={busy}
                  onClick={() => onChange({ ...value, expression })}
                >
                  {translate(`shamu.bots.expression.${expression}`, expression)}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-2">
            <Switch
              id="bot-animated-avatar"
              checked={value.animated}
              disabled={busy}
              onCheckedChange={(animated) => onChange({ ...value, animated })}
            />
            <Label htmlFor="bot-animated-avatar">
              {translate('shamu.bots.animateAvatar', 'Animate avatar')}
            </Label>
          </div>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
