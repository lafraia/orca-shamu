import { translate } from '@/i18n/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LockKeyhole, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { toast } from 'sonner'
import type {
  ShamuVaultApi,
  VaultAccess,
  VaultEntry,
  VaultSnapshot
} from '../../../../../shared/shamu-vault'
import { VaultEntryEditor } from './VaultEntryEditor'
import { VaultPasswordForm } from './VaultPasswordForm'
import { VaultRequests } from './VaultRequests'
import { VaultDeleteDialog } from './VaultDeleteDialog'
import { VaultLockedView } from './VaultLockedView'
import { VaultEntries } from './VaultEntries'
import { SecuritySurface } from '@/components/ui/security-surface'

const CLIPBOARD_TOAST = 'shamu-vault-clipboard'

export function VaultPanel({
  botId,
  name,
  open,
  onOpenChange,
  api = window.api?.projectChannels?.vault
}: {
  botId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  api?: ShamuVaultApi
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<VaultEntry | 'new' | null>(null)
  const [copying, setCopying] = useState<VaultEntry | null>(null)
  const [removing, setRemoving] = useState<VaultEntry | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const load = useRef(0)
  const lifetime = useRef(0)
  const pending = useRef(false)
  const visible = useRef(open)
  visible.current = open
  const invalidate = useCallback(() => {
    load.current++
    lifetime.current++
  }, [])
  const clearForms = useCallback(() => {
    setEditing(null)
    setCopying(null)
    setRemoving(null)
    setChangingPassword(false)
  }, [])
  const refresh = useCallback(async () => {
    if (!api || !visible.current) {
      return
    }
    const sequence = ++load.current
    try {
      const next = await api.status(botId)
      if (sequence === load.current && visible.current) {
        setSnapshot(next)
        if (next.state !== 'unlocked') {
          clearForms()
        }
      }
    } catch {
      if (sequence === load.current && visible.current) {
        setSnapshot(null)
        clearForms()
        setError('Could not read Vault safely. No data has been replaced.')
      }
    }
  }, [api, botId, clearForms])
  useEffect(() => {
    if (!open) {
      return
    }
    visible.current = true
    pending.current = false
    setBusy(false)
    setSnapshot(null)
    setError(null)
    setQuery('')
    clearForms()
    if (!api) {
      setError('Vault is available in the desktop Orca Shamu app.')
      return
    }
    void refresh()
    const unsubscribe = api.onChanged((change) => {
      if (!change.unlocked) {
        toast.dismiss(CLIPBOARD_TOAST)
      }
      void refresh()
    })
    return () => {
      invalidate()
      visible.current = false
      if (pending.current) {
        void api.lock().catch(() => {})
      }
      unsubscribe()
    }
  }, [api, open, refresh, clearForms, invalidate])

  const access = (): VaultAccess => {
    if (!snapshot?.session) {
      throw new Error('Unlock Vault first.')
    }
    return { botId, session: snapshot.session, revision: snapshot.revision }
  }
  const act = async (operation: () => Promise<unknown>, done?: () => void): Promise<void> => {
    if (busy) {
      return
    }
    const epoch = lifetime.current
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      await operation()
      if (visible.current && epoch === lifetime.current) {
        done?.()
      }
    } catch (failure) {
      if (visible.current && epoch === lifetime.current) {
        setError(failure instanceof Error ? failure.message : 'Vault operation failed.')
      }
    } finally {
      if (epoch === lifetime.current) {
        pending.current = false
        await refresh()
        if (visible.current) {
          setBusy(false)
        }
      }
    }
  }
  const unlocked = snapshot?.state === 'unlocked'
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (busy) {
            void api?.lock().catch(() => {})
          }
          invalidate()
          pending.current = false
          clearForms()
          setSnapshot(null)
          setBusy(false)
        }
        onOpenChange(next)
      }}
    >
      <SecuritySurface>
        <SheetContent motion="theme" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              <span className="flex items-center gap-2">
                <LockKeyhole className="size-4" />
                {translate('shamu.vault.title', 'Vault')}
              </span>
            </SheetTitle>
            <SheetDescription>
              {name} ·{' '}
              {unlocked
                ? translate('shamu.vault.unlocked', 'Unlocked')
                : translate('shamu.vault.locked', 'Locked')}
            </SheetDescription>
          </SheetHeader>
          {unlocked ? (
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  clearForms()
                  setEditing('new')
                }}
              >
                <Plus />
                {translate('shamu.vault.new', 'New credential')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearForms()
                  setSnapshot(null)
                  void act(() => api!.lock())
                }}
              >
                <LockKeyhole />
                {translate('shamu.vault.lock', 'Lock Vault')}
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 scrollbar-sleek">
            {error ? (
              <div role="alert" className="space-y-3 text-sm text-destructive">
                <p>{error}</p>
                {!snapshot ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError(null)
                      void refresh()
                    }}
                  >
                    <RefreshCw />
                    {translate('shamu.vault.retry', 'Retry')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!snapshot && !error ? (
              <div
                aria-busy="true"
                aria-label={translate('shamu.vault.loading', 'Loading Vault')}
                className="space-y-4"
              >
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-10 rounded bg-muted" />
                <div className="h-10 rounded bg-muted" />
              </div>
            ) : null}
            {snapshot?.state === 'unavailable' ? (
              <div className="space-y-3 py-8">
                <LockKeyhole className="size-6 text-muted-foreground" />
                <h3 className="text-sm font-medium">
                  {translate('shamu.vault.keychainUnavailable', 'OS keychain unavailable')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {translate(
                    'shamu.vault.keychainUnavailableHelp',
                    'Unlock your system keychain to use Vault. Credentials cannot be saved with plaintext or Linux’s basic_text backend.'
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    void refresh()
                  }}
                >
                  <RefreshCw />
                  {translate('shamu.vault.retry', 'Retry')}
                </Button>
              </div>
            ) : null}
            {snapshot?.state === 'missing' || snapshot?.state === 'locked' ? (
              <VaultLockedView
                key={snapshot.state}
                state={snapshot.state}
                automatic={snapshot.automaticUnlock}
                busy={busy}
                onResume={() => {
                  void act(() => api!.resume(botId))
                }}
                onAuthenticate={(password) =>
                  act(() =>
                    snapshot.state === 'missing'
                      ? api!.create(botId, password)
                      : api!.unlock(botId, password)
                  )
                }
              />
            ) : null}
            {unlocked && editing ? (
              <VaultEntryEditor
                key={editing === 'new' ? 'new' : editing.id}
                entry={editing === 'new' ? null : editing}
                busy={busy}
                onSave={(input) => act(() => api!.save(access(), input), clearForms)}
                onCancel={clearForms}
              />
            ) : null}
            {unlocked && copying ? (
              <VaultPasswordForm
                key={`copy-${copying.id}`}
                mode="copy"
                busy={busy}
                onCancel={clearForms}
                onSubmit={(password) =>
                  act(
                    () => api!.copy(access(), copying.id, password),
                    () => {
                      clearForms()
                      toast.success(
                        translate('shamu.vault.copied', 'Password copied for 30 seconds.'),
                        { id: CLIPBOARD_TOAST }
                      )
                    }
                  )
                }
              />
            ) : null}
            {unlocked && changingPassword ? (
              <VaultPasswordForm
                mode="change"
                busy={busy}
                onCancel={clearForms}
                onSubmit={(password, next) =>
                  act(() => api!.changePassphrase(access(), password, next!), clearForms)
                }
              />
            ) : null}
            {unlocked && !editing && !copying && !changingPassword ? (
              <>
                <VaultRequests
                  requests={snapshot.requests}
                  entries={snapshot.entries}
                  busy={busy}
                  onDecide={(id, approve) => {
                    void act(() => api!.decide(access(), id, approve))
                  }}
                />
                <VaultEntries
                  entries={snapshot.entries}
                  query={query}
                  busy={busy}
                  onQuery={setQuery}
                  onNew={() => setEditing('new')}
                  onCopy={setCopying}
                  onEdit={setEditing}
                  onRemove={setRemoving}
                />
              </>
            ) : null}
          </div>
          {unlocked ? (
            <div className="space-y-2 border-t border-border p-5">
              <p className="text-xs text-muted-foreground">
                {translate(
                  'shamu.vault.lifetimeHelp',
                  'Vault stays unlocked while the Shamu window is open. Closing or hiding the window, locking this computer or sleep locks it. Reopening Shamu unlocks it through the OS keychain.'
                )}
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  clearForms()
                  setChangingPassword(true)
                }}
              >
                {translate('shamu.vault.changePassword', 'Change master password')}
              </Button>
            </div>
          ) : null}
          <VaultDeleteDialog
            name={removing?.name ?? null}
            onCancel={() => setRemoving(null)}
            onDelete={() => {
              if (removing) {
                void act(() => api!.remove(access(), removing.id), clearForms)
              }
            }}
          />
        </SheetContent>
      </SecuritySurface>
    </Sheet>
  )
}
