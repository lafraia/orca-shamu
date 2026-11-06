import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function VaultDeleteDialog({
  name,
  onCancel,
  onDelete
}: {
  name: string | null
  onCancel: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <Dialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent surface="security" role="alertdialog">
        <DialogHeader>
          <DialogTitle>{translate('shamu.vault.deleteTitle', 'Delete credential?')}</DialogTitle>
          <DialogDescription>
            {translate(
              'shamu.vault.deleteDescription',
              '“{{name}}” will be removed from this Vault. This cannot be undone.',
              { name }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" autoFocus onClick={onCancel}>
            {translate('shamu.vault.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            {translate('shamu.vault.delete', 'Delete credential')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
