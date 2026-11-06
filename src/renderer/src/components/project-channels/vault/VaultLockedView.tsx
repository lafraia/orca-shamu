import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VaultPasswordForm } from './VaultPasswordForm'

export function VaultLockedView({
  state,
  automatic,
  busy,
  onAuthenticate,
  onResume
}: {
  state: 'missing' | 'locked'
  automatic: boolean
  busy: boolean
  onAuthenticate: (password: string) => Promise<void>
  onResume: () => void
}): React.JSX.Element {
  const [manual, setManual] = useState(false)
  return (
    <>
      <div className="flex size-12 items-center justify-center rounded-xl border border-border">
        <KeyRound className="size-5 text-muted-foreground" />
      </div>
      {state === 'locked' && automatic && !manual ? (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Unlock with this device’s keychain</h3>
          <p className="text-sm text-muted-foreground">
            Vault unlocks automatically when the Shamu window opens.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setManual(true)}>
              Use master password
            </Button>
            <Button disabled={busy} onClick={onResume}>
              {busy ? 'Unlocking…' : 'Unlock Vault'}
            </Button>
          </div>
        </div>
      ) : (
        <VaultPasswordForm
          mode={state === 'missing' ? 'create' : 'unlock'}
          busy={busy}
          onSubmit={onAuthenticate}
        />
      )}
      {state === 'locked' && !automatic ? (
        <p className="text-sm text-muted-foreground">
          Unlock once with the master password to enable automatic opening on this device.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">AES-256-GCM · OS keychain</p>
    </>
  )
}
