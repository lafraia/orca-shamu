import { translate } from '@/i18n/i18n'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function VaultPasswordForm({
  mode,
  busy,
  onSubmit,
  onCancel
}: {
  mode: 'create' | 'unlock' | 'copy' | 'change'
  busy: boolean
  onSubmit: (password: string, next?: string) => Promise<void>
  onCancel?: () => void
}): React.JSX.Element {
  const id = useId()
  const creating = mode === 'create'
  const changing = mode === 'change'
  const title = {
    create: translate('shamu.vault.create', 'Create Vault'),
    unlock: translate('shamu.vault.unlock', 'Unlock Vault'),
    copy: translate('shamu.vault.copy', 'Copy password'),
    change: translate('shamu.vault.changePassword', 'Change master password')
  }[mode]
  return (
    <form
      className="space-y-5"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        if (!form.reportValidity()) {
          return
        }
        const data = new FormData(form)
        const password = String(data.get('password') ?? '')
        const next = changing ? String(data.get('next') ?? '') : password
        const confirmation = form.elements.namedItem('confirmation')
        if (confirmation instanceof HTMLInputElement && confirmation.value !== next) {
          confirmation.setCustomValidity(
            translate('shamu.vault.passwordMismatch', 'Passwords do not match.')
          )
          confirmation.reportValidity()
          return
        }
        form.reset()
        void onSubmit(password, changing ? next : undefined)
      }}
    >
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-2">
        <Label htmlFor={`${id}-password`}>
          {changing
            ? translate('shamu.vault.currentPassword', 'Current master password')
            : translate('shamu.vault.masterPassword', 'Master password')}
        </Label>
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          required
          minLength={creating ? 15 : 1}
          maxLength={1024}
          autoComplete={creating ? 'new-password' : 'current-password'}
          autoFocus
          disabled={busy}
          spellCheck={false}
        />
      </div>
      {changing ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-next`}>
            {translate('shamu.vault.newPassword', 'New master password')}
          </Label>
          <Input
            id={`${id}-next`}
            name="next"
            type="password"
            required
            minLength={15}
            maxLength={1024}
            autoComplete="new-password"
            disabled={busy}
            spellCheck={false}
          />
        </div>
      ) : null}
      {creating || changing ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${id}-confirmation`}>
              {translate('shamu.vault.confirmPassword', 'Confirm master password')}
            </Label>
            <Input
              id={`${id}-confirmation`}
              name="confirmation"
              type="password"
              required
              maxLength={1024}
              autoComplete="new-password"
              disabled={busy}
              onInput={(event) => event.currentTarget.setCustomValidity('')}
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'shamu.vault.passwordHelp',
              'Use at least 15 characters. Keep this password to confirm copies and password changes. Vault unlocks automatically using this device’s keychain.'
            )}
          </p>
        </>
      ) : null}
      {mode === 'copy' ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'shamu.vault.clipboardHelp',
            'The clipboard clears after 30 seconds if it still contains this password. Clipboard history apps may retain copies.'
          )}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {translate('shamu.vault.cancel', 'Cancel')}
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? translate('shamu.vault.authenticating', 'Authenticating…') : title}
        </Button>
      </div>
    </form>
  )
}
