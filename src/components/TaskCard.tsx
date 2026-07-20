import { useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../lib/types'
import type { Shade } from '../lib/shading'

interface Props {
  task: Task
  shade: Shade
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
  onEdit: (task: Task) => void
}

// A drag that ends over the card still fires a click; anything that travelled
// further than this was a drag, not a tap, and must not open the editor.
const TAP_SLOP_PX = 8

export function TaskCard({ task, shade, onToggle, onDelete, onEdit }: Props) {
  // Completed tasks never move (invariant), so they are not draggable.
  const sortable = useSortable({ id: task.id, disabled: task.done })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable
  const downAt = useRef<{ x: number; y: number } | null>(null)

  const style: React.CSSProperties = {
    background: shade.background,
    color: shade.foreground,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  }

  const chipBg = shade.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.20)'

  function handleClick(e: React.MouseEvent) {
    const from = downAt.current
    downAt.current = null
    if (!from) return
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP_PX) return
    onEdit(task)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="task"
      {...attributes}
      {...listeners}
      // Capture phase: dnd-kit owns the bubbling onPointerDown via {...listeners}.
      onPointerDownCapture={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY }
      }}
      onClick={handleClick}
    >
      <button
        type="button"
        className="checkbox"
        aria-label={task.done ? 'Mark not done' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(task)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          borderColor: shade.foreground,
          background: task.done ? shade.foreground : 'transparent',
          color: shade.background,
        }}
      >
        {task.done ? '✓' : ''}
      </button>

      {/* Not a <button>: swallowing pointerdown here would kill the drag
          handle over most of the card. The card's own tap handler covers it. */}
      <span
        className="task-title"
        style={{
          textDecoration: task.done ? 'line-through' : 'none',
          opacity: task.done ? 0.75 : 1,
        }}
      >
        {task.title}
      </span>

      {task.duration_min != null && (
        <span className="chip" style={{ background: chipBg }}>
          {task.duration_min}m
        </span>
      )}

      <button
        type="button"
        className="task-delete"
        aria-label="Delete task"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(task)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ color: shade.foreground }}
      >
        ×
      </button>
    </div>
  )
}
