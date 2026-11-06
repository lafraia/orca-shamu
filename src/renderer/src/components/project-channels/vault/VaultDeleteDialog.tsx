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
          <DialogTitle>Delete credential?</DialogTitle>
          <DialogDescription>
            “{name}” will be removed from this Vault. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            Delete credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
