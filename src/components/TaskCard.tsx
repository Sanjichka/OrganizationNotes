import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Subtask, Task } from '../lib/types'
import type { Shade } from '../lib/shading'
import { SubtaskList } from './SubtaskList'

interface Props {
  task: Task
  shade: Shade
  subtasks: Subtask[]
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
  onEdit: (task: Task) => void
  onAddSubtask: (task: Task, title: string) => void
  onToggleSubtask: (subtask: Subtask) => void
  onRenameSubtask: (subtask: Subtask, title: string) => void
  onDeleteSubtask: (subtask: Subtask) => void
}

// A drag that ends over the card still fires a click; anything that travelled
// further than this was a drag, not a tap, and must not open the editor.
const TAP_SLOP_PX = 8

export function TaskCard({
  task,
  shade,
  subtasks,
  onToggle,
  onDelete,
  onEdit,
  onAddSubtask,
  onToggleSubtask,
  onRenameSubtask,
  onDeleteSubtask,
}: Props) {
  // Completed tasks never move (invariant), so they are not draggable.
  const sortable = useSortable({ id: task.id, disabled: task.done })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const [expanded, setExpanded] = useState(false)

  const total = subtasks.length
  const doneCount = subtasks.filter((s) => s.done).length

  const wrapStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const rowStyle: React.CSSProperties = {
    background: shade.background,
    color: shade.foreground,
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
    <div ref={setNodeRef} style={wrapStyle} className="task-wrap" {...attributes}>
      <div
        style={rowStyle}
        className="task"
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

        {/* Disclosure for the subtask checklist. Shows progress when the task
            has subtasks; always expandable so the first one can be added. */}
        <button
          type="button"
          className="subtask-toggle"
          aria-label={expanded ? 'Hide subtasks' : 'Show subtasks'}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ color: shade.foreground }}
        >
          {total > 0 && (
            <span className="subtask-count" style={{ background: chipBg }}>
              {doneCount}/{total}
            </span>
          )}
          <span
            className="subtask-caret"
            style={{ rotate: expanded ? '90deg' : '0deg' }}
          >
            ›
          </span>
        </button>

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

      {expanded && (
        <SubtaskList
          subtasks={subtasks}
          shade={shade}
          onToggle={onToggleSubtask}
          onAdd={(title) => onAddSubtask(task, title)}
          onRename={onRenameSubtask}
          onDelete={onDeleteSubtask}
        />
      )}
    </div>
  )
}
