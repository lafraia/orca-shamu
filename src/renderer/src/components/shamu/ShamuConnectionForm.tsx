import { useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useProjectChannels } from '../project-channels/project-channel-store'
import { connectShamuPrimary } from './shamu-client-store'

export function ShamuConnectionForm({
  onConnected,
  onCancel,
  embedded = false
}: {
  onConnected?: () => void
  onCancel?: () => void
  embedded?: boolean
}): React.JSX.Element {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const submit = async (): Promise<void> => {
    if (!code.trim() || busy) {
      return
    }
    setBusy(true)
    setError(false)
    try {
      await connectShamuPrimary(code)
      setCode('')
      if (!embedded) {
        useProjectChannels.setState({ mode: 'workspaces' })
        useAppStore.setState({ activeView: 'terminal' })
      }
      onConnected?.()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className={
        embedded
          ? undefined
          : 'flex min-h-0 flex-1 items-center justify-center overflow-y-auto scrollbar-sleek bg-background p-6'
      }
    >
      <form
        className="w-full max-w-lg space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-3" hidden={embedded}>
          <Link2 className="size-7 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{translate('shamu.title', 'Orca Shamu')}</h1>
          <p className="text-sm text-muted-foreground">
            {translate(
              'shamu.description',
              'Use the sessions and controls of your primary Orca, with both apps open.'
            )}
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            {translate(
              'shamu.stepSettings',
              'In the primary Orca, open Settings → Remote Orca Servers.'
            )}
          </li>
          <li>{translate('shamu.stepLink', 'Create an access link and choose This computer.')}</li>
          <li>
            {translate(
              'shamu.stepPaste',
              'Paste that link here to connect to the existing sessions.'
            )}
          </li>
        </ol>
        <div className="space-y-2">
          <Label htmlFor="shamu-access-link">
            {translate('shamu.accessLink', 'Primary Orca access link')}
          </Label>
          <Input
            id="shamu-access-link"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={code}
            disabled={busy}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {translate(
              'shamu.connectError',
              'Could not connect. Keep the primary Orca open and generate a new link for This computer.'
            )}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {translate('shamu.cancel', 'Cancel')}
            </Button>
          ) : null}
          <Button type="submit" disabled={!code.trim() || busy}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Link2 />}
            {busy
              ? translate('shamu.connecting', 'Connecting…')
              : translate('shamu.connect', 'Connect to primary Orca')}
          </Button>
        </div>
      </form>
    </div>
  )
}
