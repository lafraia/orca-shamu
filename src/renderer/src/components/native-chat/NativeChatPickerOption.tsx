import { cn } from '@/lib/utils'

export function PickerStatus({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

export function PickerOptionButton({
  id,
  selected,
  activeItemRef,
  onChoose,
  onActivate,
  children
}: {
  id: string
  selected: boolean
  activeItemRef: React.MutableRefObject<HTMLButtonElement | null>
  onChoose: () => void
  onActivate?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      id={id}
      ref={selected ? activeItemRef : null}
      role="option"
      aria-selected={selected}
      type="button"
      onPointerMove={(event) => {
        if (event.movementX || event.movementY) {
          onActivate?.()
        }
      }}
      onPointerDown={(event) => {
        // Accept before focus transfer because the textarea owns query and caret state.
        event.preventDefault()
        if (event.button === 0) {
          onChoose()
        }
      }}
      className={cn(
        'flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm',
        !onActivate &&
          'hover:bg-accent hover:text-accent-foreground hover:[--muted-foreground:var(--accent-foreground)]',
        selected &&
          'border-border bg-accent text-accent-foreground [--muted-foreground:var(--accent-foreground)]'
      )}
    >
      {children}
    </button>
  )
}
