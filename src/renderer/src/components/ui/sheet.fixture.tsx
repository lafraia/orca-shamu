import { defineFixture } from '../../component-fixtures/component-fixture'
import { useState } from 'react'
import { Button } from './button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'

export const modal = defineFixture({
  width: 1100,
  render: () => (
    <>
      <div className="app-layout bg-background p-6 text-foreground">
        <p>Workspace content stays live behind the sheet.</p>
      </div>
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet preview</SheetTitle>
            <SheetDescription>
              The sheet text stays sharp above the blurred workspace.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </>
  )
})

function DismissibleSheet(): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-background p-6 text-foreground">
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent motion="theme">
          <SheetHeader>
            <SheetTitle>Drawer motion</SheetTitle>
            <SheetDescription>Click outside or press Escape to close this panel.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export const dismissible = defineFixture({ width: 1100, render: () => <DismissibleSheet /> })
