import { useRef } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Subtask } from '../lib/types'
import type { Shade } from '../lib/shading'
import { formatDuration, formatTime } from '../lib/duration'

// Sortable ids are namespaced so a subtask never collides with a task id in the
// shared DndContext. Board parses the same prefix back off on drop.
export const subtaskDragId = (id: string) => `sub:${id}`

// A drag that ends over the row still fires a click; anything past this was a
// drag, not a tap, and must not open the editor. Mirrors TaskCard's TAP_SLOP_PX.
const TAP_SLOP_PX = 8

interface Props {
  subtasks: Subtask[] // already sorted by position
  /** Parent card shade — the checkbox borrows the day's ink so rows read as
   *  belonging to their task rather than floating free. */
  shade: Shade
  onToggle: (subtask: Subtask) => void
  onAdd: () => void
  onEdit: (subtask: Subtask) => void
  onDelete: (subtask: Subtask) => void
}

/**
 * The checklist that unfolds beneath a task card. Rendered inside the sortable
 * wrapper but OUTSIDE the draggable card row, so dragging the parent is
 * unaffected. Each row is itself sortable (long-press to lift) so subtasks
 * reorder within the list, re-parent onto another task, or promote onto a day —
 * all handled by Board's single DndContext.
 */
export function SubtaskList({ subtasks, shade, onToggle, onAdd, onEdit, onDelete }: Props) {
  const chipBg = shade.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.20)'
  return (
    <div className="subtasks">
      <SortableContext
        items={subtasks.map((s) => subtaskDragId(s.id))}
        strategy={verticalListSortingStrategy}
      >
        {subtasks.map((s) => (
          <SubtaskRow
            key={s.id}
            subtask={s}
            shade={shade}
            chipBg={chipBg}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </SortableContext>

      <button
        type="button"
        className="subtask subtask-add"
        onClick={onAdd}
        style={{ color: shade.foreground }}
      >
        <span className="subtask-plus">+</span>
        <span className="subtask-add-label">Add subtask</span>
      </button>
    </div>
  )
}

function SubtaskRow({
  subtask: s,
  shade,
  chipBg,
  onToggle,
  onEdit,
  onDelete,
}: {
  subtask: Subtask
  shade: Shade
  chipBg: string
  onToggle: (subtask: Subtask) => void
  onEdit: (subtask: Subtask) => void
  onDelete: (subtask: Subtask) => void
}) {
  // Completed subtasks, like completed tasks, are not draggable.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: subtaskDragId(s.id), disabled: s.done })
  const downAt = useRef<{ x: number; y: number } | null>(null)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="subtask"
      {...attributes}
      {...listeners}
      // Capture phase so recording the tap origin doesn't displace dnd-kit's
      // bubble-phase onPointerDown from {...listeners} (see TaskCard).
      onPointerDownCapture={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY }
      }}
      onClick={(e) => {
        const from = downAt.current
        downAt.current = null
        if (!from) return
        if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP_PX) return
        onEdit(s)
      }}
    >
      <button
        type="button"
        className="subtask-check"
        aria-label={s.done ? 'Mark subtask not done' : 'Mark subtask done'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(s)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          borderColor: shade.foreground,
          background: s.done ? shade.foreground : 'transparent',
          color: shade.background,
        }}
      >
        {s.done ? '✓' : ''}
      </button>

      <span
        className="subtask-title"
        style={{
          textDecoration: s.done ? 'line-through' : 'none',
          opacity: s.done ? 0.55 : 0.9,
        }}
      >
        {s.title}
      </span>

      {s.start_time && (
        <span className="chip subtask-chip" style={{ background: chipBg }}>
          {formatTime(s.start_time)}
        </span>
      )}
      {s.duration_min != null && (
        <span className="chip subtask-chip" style={{ background: chipBg }}>
          {formatDuration(s.duration_min)}
        </span>
      )}

      <button
        type="button"
        className="subtask-delete"
        aria-label="Delete subtask"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(s)
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  )
}
