import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function NativeChatPickerListbox({
  id,
  children
}: {
  id: string
  children: ReactNode
}): React.JSX.Element {
  const marker = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<HTMLDivElement | null>(null)
  useLayoutEffect(() => setAnchor(marker.current?.parentElement ?? null), [])
  useLayoutEffect(() => {
    if (!anchor || !menu) {
      return
    }
    let active = true
    const update = (): void => {
      void computePosition(anchor, menu, {
        placement: 'top-start',
        strategy: 'fixed',
        middleware: [
          offset(4),
          flip(),
          shift({ padding: 8 }),
          size({
            padding: 8,
            apply({ availableHeight, availableWidth, rects, elements }) {
              Object.assign(elements.floating.style, {
                width: `${Math.max(0, Math.min(rects.reference.width, availableWidth))}px`,
                maxHeight: `min(18rem, ${Math.max(0, availableHeight)}px)`
              })
            }
          })
        ]
      }).then(({ x, y }) => {
        if (active) {
          Object.assign(menu.style, { left: `${x}px`, top: `${y}px`, opacity: 1 })
        }
      })
    }
    // Floating chat panels move via transforms without resizing their composer.
    const cleanup = autoUpdate(anchor, menu, update, { animationFrame: true })
    return () => {
      active = false
      cleanup()
    }
  }, [anchor, menu])
  // A background composer's suggestions stay beneath the floating workspace's own suggestions.
  const layer = anchor?.closest('[data-slot="popover-content"]')
    ? 'z-[70]'
    : anchor?.closest('[data-floating-terminal-panel]')
      ? 'z-50'
      : 'z-40'

  return (
    <>
      <span ref={marker} />
      {anchor &&
        createPortal(
          <div
            ref={setMenu}
            id={id}
            role="listbox"
            data-focus-behavior="composer-suggestions"
            style={{ position: 'fixed', opacity: 0 }}
            className={`scrollbar-sleek max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-floating ${layer}`}
          >
            {children}
          </div>,
          anchor.closest('.native-chat-appearance') ?? document.body
        )}
    </>
  )
}
