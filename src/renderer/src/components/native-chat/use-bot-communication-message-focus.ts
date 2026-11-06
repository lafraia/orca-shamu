import { useEffect, type RefObject } from 'react'

export function useBotCommunicationMessageFocus({
  open,
  ready,
  selectionId,
  viewportRef,
  contentRef,
  selectedRef
}: {
  open: boolean
  ready: boolean
  selectionId: string
  viewportRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  selectedRef: RefObject<HTMLElement | null>
}): void {
  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    const selected = selectedRef.current
    if (
      !open ||
      !ready ||
      !viewport ||
      !content ||
      !selected ||
      selected.dataset.communicationEntry !== selectionId
    ) {
      return
    }
    let active = true
    const align = (): void => {
      if (!active) {
        return
      }
      const top = selected.getBoundingClientRect().top - content.getBoundingClientRect().top
      if (Math.abs(viewport.scrollTop - top) > 1) {
        viewport.scrollTo({ top, behavior: 'auto' })
      }
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(content)
    const stop = (): void => {
      active = false
      observer.disconnect()
    }
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    const inputRoot = viewport.parentElement ?? viewport
    events.forEach((event) =>
      inputRoot.addEventListener(event, stop, { once: true, passive: true })
    )
    return () => {
      active = false
      observer.disconnect()
      events.forEach((event) => inputRoot.removeEventListener(event, stop))
    }
  }, [open, ready, selectionId, viewportRef, contentRef, selectedRef])
}
