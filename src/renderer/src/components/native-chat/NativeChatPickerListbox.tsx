import { autoUpdate, computePosition, offset, size } from '@floating-ui/dom'
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
  const listbox = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setContainer(marker.current?.closest<HTMLElement>('.native-chat-appearance') ?? document.body)
  }, [])
  useLayoutEffect(() => {
    const anchor = marker.current?.parentElement
    const floating = listbox.current
    if (!anchor || !floating) {
      return
    }
    // autoUpdate also follows moves with no resize or scroll, like dragging the floating panel.
    return autoUpdate(anchor, floating, () => {
      void computePosition(anchor, floating, {
        strategy: 'fixed',
        placement: 'top-start',
        middleware: [
          offset(4),
          size({
            padding: 8,
            apply: ({ rects, availableHeight }) => {
              floating.style.width = `${rects.reference.width}px`
              floating.style.maxHeight = `min(calc(var(--spacing) * 72), ${Math.max(0, availableHeight)}px)`
            }
          })
        ]
      }).then(({ x, y }) => {
        floating.style.left = `${x}px`
        floating.style.top = `${y}px`
      })
    })
  }, [container])
  const anchor = marker.current
  // A background composer's suggestions stay beneath the floating workspace's own suggestions.
  const layer = anchor?.closest(
    '[data-slot="popover-content"], [data-slot="dropdown-menu-sub-content"]'
  )
    ? 'z-[70]'
    : anchor?.closest('[data-floating-terminal-panel]')
      ? 'z-50'
      : 'z-40'

  return (
    <>
      <span ref={marker} />
      {container &&
        createPortal(
          <div
            ref={listbox}
            id={id}
            role="listbox"
            data-focus-behavior="composer-suggestions"
            className={`scrollbar-sleek fixed left-0 top-0 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-floating ${layer}`}
          >
            {children}
          </div>,
          container
        )}
    </>
  )
}
