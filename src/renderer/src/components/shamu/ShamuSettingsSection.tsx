import { useState } from 'react'
import { Link2, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SettingsSection } from '../settings/section-layout/SettingsSection'
import { SettingsRow } from '../settings/form-controls/SettingsFormControls'
import { reconnectShamuPrimary } from './shamu-client-store'
import { useShamuConnection } from './use-shamu-connection'
import { useShamuClient } from './shamu-client-state'
import { ShamuConnectionForm } from './ShamuConnectionForm'
import { getShamuSettingsSearchEntries } from './shamu-settings-search'
import { ShamuProjectNotice } from './ShamuProjectNotice'

export function ShamuSettingsSection(): React.JSX.Element | null {
  const enabled = useShamuClient((state) => state.enabled)
  if (!enabled) {
    return null
  }
  return (
    <SettingsSection
      id="orca-shamu"
      title="Orca Shamu"
      description={translate(
        'shamu.settings.description',
        'An independent, open source fork of Orca maintained by Daniel Lafraia (lafraia).'
      )}
      searchEntries={getShamuSettingsSearchEntries()}
    >
      <ShamuSettingsPane />
    </SettingsSection>
  )
}

function ShamuSettingsPane(): React.JSX.Element {
  const connection = useShamuConnection()
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState<'import' | 'reconnect' | null>(null)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const run = async (action: 'import' | 'reconnect'): Promise<void> => {
    if (busy) {
      return
    }
    setBusy(action)
    setNotice(null)
    try {
      if (action === 'import') {
        const preferences = await window.api.shamuClient!.readPrimaryPreferences()
        await useAppStore.getState().updateSettingsOrThrow(preferences)
      } else {
        await reconnectShamuPrimary()
      }
      setNotice({
        error: false,
        text:
          action === 'import'
            ? translate('shamu.preferencesImported', 'Settings imported')
            : translate('shamu.connected', 'Connected')
      })
    } catch {
      setNotice({
        error: true,
        text:
          action === 'import'
            ? translate('shamu.preferencesError', 'Could not import interface settings.')
            : translate(
                'shamu.reconnectError',
                'Could not reconnect. Keep the primary Orca running and try again.'
              )
      })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-6">
      <SettingsRow
        label={translate('shamu.primary', 'Primary Orca')}
        description={translate(
          'shamu.settings.primaryDescription',
          'Keep the primary Orca running to use its chats, agents and controls.'
        )}
        control={
          <span
            role="status"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Link2 className="size-4" />
            {connection.live
              ? translate('shamu.connected', 'Connected')
              : translate('shamu.disconnected', 'Disconnected')}
          </span>
        }
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={busy !== null || connection.live}
          onClick={() => void run('reconnect')}
        >
          {busy === 'reconnect' ? <LoadingSpinner /> : <RefreshCw />}
          {translate('shamu.reconnect', 'Reconnect')}
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => setEdit(true)}>
          {translate('shamu.updateLink', 'Update access link')}
        </Button>
      </div>
      <SettingsRow
        label={translate('shamu.settings.interface', 'Shamu interface')}
        description={translate(
          'shamu.settings.importDescription',
          'Copy fonts, appearance and interface preferences from the primary Orca to Shamu.'
        )}
        control={
          <Button
            variant="outline"
            disabled={busy !== null || !connection.live}
            onClick={() => void run('import')}
          >
            {busy === 'import' ? <LoadingSpinner /> : null}
            {translate('shamu.importPreferences', 'Import interface settings')}
          </Button>
        }
      />
      {notice ? (
        <p
          role={notice.error ? 'alert' : 'status'}
          className={notice.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {notice.text}
        </p>
      ) : null}
      <ShamuProjectNotice />
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent surface="security" scrollable>
          <DialogHeader>
            <DialogTitle>{translate('shamu.updateLink', 'Update access link')}</DialogTitle>
            <DialogDescription>
              {translate(
                'shamu.settings.renewDescription',
                'Use a new access link from the same primary Orca.'
              )}
            </DialogDescription>
          </DialogHeader>
          <ShamuConnectionForm
            embedded
            onConnected={() => setEdit(false)}
            onCancel={() => setEdit(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
