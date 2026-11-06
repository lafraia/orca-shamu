import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection
} from '@dnd-kit/core'
import { Folder } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { BotRosterMove } from '../../../../shared/bot-roster-move'
import { runBotRosterCommand } from './bot-roster-actions'

export type BotSidebarDragItem = {
  kind: 'section' | 'bot'
  id: string
  label: string
  section: string | null
}
type Drop = { id: string; placement: 'before' | 'after' }
const DragState = createContext<{
  active: BotSidebarDragItem | null
  drop: Drop | null
  pending: boolean
}>({
  active: null,
  drop: null,
  pending: false
})

export function BotSidebarDrag({ children }: { children: ReactNode }): React.JSX.Element {
  const [active, setActive] = useState<BotSidebarDragItem | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [pending, setPending] = useState(false)
  const latestDrop = useRef<Drop | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )
  const collisionDetection: CollisionDetection = (args) => {
    const source: BotSidebarDragItem | undefined = args.active.data.current?.item
    const containers = args.droppableContainers.filter((row) => {
      const item: BotSidebarDragItem | undefined = row.data.current?.item
      return item && (source?.kind === 'bot' || (item.kind === 'section' && item.section !== null))
    })
    const hits = pointerWithin({ ...args, droppableContainers: containers })
    const hit =
      hits.find(
        (row) =>
          args.droppableContainers.find((node) => node.id === row.id)?.data.current?.item.kind ===
          'bot'
      ) ?? hits[0]
    const rect = hit && args.droppableRects.get(hit.id)
    latestDrop.current =
      hit && rect && args.pointerCoordinates
        ? {
            id: String(hit.id),
            placement: args.pointerCoordinates.y < rect.top + rect.height / 2 ? 'before' : 'after'
          }
        : null
    return hit ? [hit] : []
  }
  const publishDrop = (): void =>
    setDrop((current) =>
      current?.id === latestDrop.current?.id && current?.placement === latestDrop.current?.placement
        ? current
        : latestDrop.current
    )
  const clear = (): void => {
    setActive(null)
    setDrop(null)
    latestDrop.current = null
  }
  const state = useMemo(() => ({ active, drop, pending }), [active, drop, pending])
  return (
    <DragState.Provider value={state}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          screenReaderInstructions: {
            draggable: translate(
              'shamu.bots.dragInstructions',
              'Drag to move. Use Alt and the arrow keys to reorder without dragging.'
            )
          }
        }}
        onDragStart={({ active: item }) => setActive(item.data.current?.item ?? null)}
        onDragMove={publishDrop}
        onDragOver={publishDrop}
        onDragCancel={clear}
        onDragEnd={({ active: dragged, over }) => {
          const source: BotSidebarDragItem | undefined = dragged.data.current?.item
          const target: BotSidebarDragItem | undefined = over?.data.current?.item
          const placement = latestDrop.current?.placement ?? 'after'
          clear()
          if (!source || !target || source.id === target.id) {
            return
          }
          let move: BotRosterMove
          if (source.kind === 'section') {
            if (source.section === null || target.kind !== 'section' || target.section === null) {
              return
            }
            move = {
              kind: 'section',
              section: source.section,
              targetSection: target.section,
              placement
            }
          } else {
            move = {
              kind: 'bot',
              botId: source.id.slice('bot:'.length),
              section: target.section,
              placement,
              ...(target.kind === 'bot' ? { relativeTo: target.id.slice('bot:'.length) } : {})
            }
          }
          setPending(true)
          void runBotRosterCommand({ action: 'reorder', move })
            .catch(() => {})
            .finally(() => setPending(false))
        }}
      >
        {children}
        {createPortal(
          <DragOverlay dropAnimation={null} zIndex={40}>
            {active ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-worktree-sidebar px-2 py-2 text-[13px] text-worktree-sidebar-foreground opacity-90">
                {active.kind === 'section' ? <Folder className="size-3.5" /> : null}
                <span className="truncate font-medium">{active.label}</span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </DragState.Provider>
  )
}

export function useBotSidebarDrag(item: BotSidebarDragItem) {
  const state = useContext(DragState)
  const draggable = useDraggable({
    id: item.id,
    data: { item },
    disabled: state.pending || (item.kind === 'section' && item.section === null)
  })
  const droppable = useDroppable({ id: item.id, data: { item }, disabled: state.pending })
  const setDragNode = draggable.setNodeRef
  const setDropNode = droppable.setNodeRef
  const ref = useCallback(
    (node: HTMLElement | null): void => {
      setDragNode(node)
      setDropNode(node)
    },
    [setDragNode, setDropNode]
  )
  return {
    ref,
    handle: { ...draggable.attributes, ...draggable.listeners, ref: draggable.setActivatorNodeRef },
    dragging: draggable.isDragging,
    insertion:
      state.drop?.id === item.id
        ? state.active?.kind === 'bot' && item.kind === 'section'
          ? ('inside' as const)
          : state.drop.placement
        : null,
    pending: state.pending
  }
}

export function BotSidebarDropMark({
  placement
}: {
  placement: 'before' | 'after' | 'inside' | null
}): React.JSX.Element | null {
  return placement ? (
    <span
      aria-hidden="true"
      className={
        placement === 'inside'
          ? 'pointer-events-none absolute inset-0 rounded-md ring-1 ring-ring'
          : `pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-ring ${placement === 'before' ? 'top-0' : 'bottom-0'}`
      }
    />
  ) : null
}
