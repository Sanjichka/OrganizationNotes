import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../lib/types'
import type { Shade } from '../lib/shading'

interface Props {
  task: Task
  shade: Shade
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
}

export function TaskCard({ task, shade, onToggle, onDelete }: Props) {
  // Completed tasks never move (invariant), so they are not draggable.
  const sortable = useSortable({ id: task.id, disabled: task.done })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable

  const style: React.CSSProperties = {
    background: shade.background,
    color: shade.foreground,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  }

  const chipBg = shade.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.20)'

  return (
    <div ref={setNodeRef} style={style} className="task" {...attributes} {...listeners}>
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
