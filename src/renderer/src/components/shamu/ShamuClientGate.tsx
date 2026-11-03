import { useEffect, useState, type ReactNode } from 'react'
import { Link2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { runtimeHostContactForEntry } from '../../../../shared/runtime-host-contact'
import { useProjectChannels } from '../project-channels/project-channel-store'
import {
  connectShamuPrimary,
  loadShamuClient,
  reconnectShamuPrimary,
  reloadShamuClient,
  useShamuClient
} from './shamu-client-store'

export function ShamuClientGate({ children }: { children: ReactNode }): React.JSX.Element {
  const connection = useShamuClient()
  const [edit, setEdit] = useState(false)
  const hasApi = Boolean(window.api?.shamuClient)
  useEffect(() => {
    if (hasApi) {
      void loadShamuClient()
    }
  }, [hasApi])
  if (!hasApi) {
    return <>{children}</>
  }
  if (!connection.loaded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6" role="status">
        <p className="text-sm text-muted-foreground">
          {translate('shamu.loading', 'Connecting to the primary Orca…')}
        </p>
        <div className="flex flex-1 gap-6" aria-hidden="true">
          <div className="w-52 space-y-3 rounded-lg bg-muted/40 p-4">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-8 rounded-md bg-muted" />
            ))}
          </div>
          <div className="flex-1 rounded-lg border border-border bg-muted/20" />
        </div>
      </div>
    )
  }
  if (!connection.enabled && !connection.error) {
    return <>{children}</>
  }
  if (connection.error && !connection.environmentId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6" role="alert">
        <p className="text-sm text-muted-foreground">
          {translate(
            'shamu.loadError',
            'Could not load the Shamu connection. Your saved sessions have not been changed.'
          )}
        </p>
        <Button variant="outline" onClick={() => void reloadShamuClient()}>
          {translate('shamu.retry', 'Try again')}
        </Button>
      </div>
    )
  }
  if (!connection.environmentId || edit) {
    return (
      <ShamuConnectionForm
        onConnected={() => setEdit(false)}
        onCancel={connection.environmentId ? () => setEdit(false) : undefined}
      />
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ShamuConnectionStatus onEdit={() => setEdit(true)} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

function ShamuConnectionForm({
  onConnected,
  onCancel
}: {
  onConnected: () => void
  onCancel?: () => void
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
      useProjectChannels.setState({ mode: 'workspaces' })
      useAppStore.setState({ activeView: 'terminal' })
      onConnected()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto scrollbar-sleek bg-background p-6">
      <form
        className="w-full max-w-lg space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-3">
          <Link2 className="size-7 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Orca Shamu</h1>
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
    </main>
  )
}

function ShamuConnectionStatus({ onEdit }: { onEdit: () => void }): React.JSX.Element {
  const id = useShamuClient((state) => state.environmentId)
  const hydrationError = useShamuClient((state) => state.error)
  const live = useAppStore(
    (state) =>
      id !== null &&
      runtimeHostContactForEntry(state.runtimeStatusByEnvironmentId.get(id)).verdict === 'live'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const reconnect = async (): Promise<void> => {
    setBusy(true)
    setError(false)
    try {
      await reconnectShamuPrimary()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-4 py-1 text-xs text-muted-foreground"
      role="status"
    >
      <Link2 className="size-3.5" />
      <span>{translate('shamu.primary', 'Primary Orca')}</span>
      <span>
        {live && !error && !hydrationError
          ? translate('shamu.connected', 'Connected')
          : translate('shamu.disconnected', 'Disconnected')}
      </span>
      {!live || error || hydrationError ? (
        <>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => void reconnect()}
            className="ml-auto"
          >
            <RefreshCw />
            {translate('shamu.reconnect', 'Reconnect')}
          </Button>
          <Button variant="ghost" size="xs" onClick={onEdit}>
            {translate('shamu.updateLink', 'Update access link')}
          </Button>
        </>
      ) : null}
    </div>
  )
}
