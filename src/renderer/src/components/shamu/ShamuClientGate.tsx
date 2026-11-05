import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { loadShamuClient, reloadShamuClient, useShamuClient } from './shamu-client-store'
import { ShamuConnectionForm } from './ShamuConnectionForm'

export function ShamuClientGate({ children }: { children: ReactNode }): React.JSX.Element {
  const connection = useShamuClient()
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
  if (!connection.environmentId) {
    return <ShamuConnectionForm />
  }
  return <>{children}</>
}
