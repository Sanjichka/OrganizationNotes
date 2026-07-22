import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Subtask, Task } from '../lib/types'
import type { Shade } from '../lib/shading'
import { formatDuration, formatTime } from '../lib/duration'
import { SubtaskList } from './SubtaskList'

interface Props {
  task: Task
  shade: Shade
  subtasks: Subtask[]
  /** True while a dragged task/subtask hovers this card's central band and would
   *  nest into it — drives the drop-target ring. */
  nesting?: boolean
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
  onEdit: (task: Task) => void
  onAddSubtask: (task: Task) => void
  onEditSubtask: (subtask: Subtask) => void
  onToggleSubtask: (subtask: Subtask) => void
  onDeleteSubtask: (subtask: Subtask) => void
}

// A drag that ends over the card still fires a click; anything that travelled
// further than this was a drag, not a tap, and must not open the editor.
const TAP_SLOP_PX = 8

// Swipe-to-delete: dragging the card left reveals a red panel with a bin.
// REVEAL is the panel's width (and the resting open offset); a release past
// OPEN_THRESHOLD snaps open, otherwise it snaps shut.
const REVEAL_PX = 76
const OPEN_THRESHOLD_PX = 38

export function TaskCard({
  task,
  shade,
  subtasks,
  nesting = false,
  onToggle,
  onDelete,
  onEdit,
  onAddSubtask,
  onEditSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: Props) {
  // Completed tasks never move (invariant), so they are not draggable.
  const sortable = useSortable({ id: task.id, disabled: task.done })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const [expanded, setExpanded] = useState(false)

  // How far the card is slid left (0 = closed, REVEAL_PX = bin fully shown).
  const [offset, setOffset] = useState(0)
  // Transition the transform on snap/close, but not while the finger tracks it.
  const [animate, setAnimate] = useState(false)
  // Live gesture bookkeeping, kept in a ref so a move doesn't re-render per pixel.
  const swipe = useRef<{
    x: number
    y: number
    base: number
    dir: null | 'h' | 'v'
    active: boolean
  } | null>(null)

  function closeSwipe() {
    setAnimate(true)
    setOffset(0)
  }

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
    transform: `translateX(${-offset}px)`,
    transition: animate ? 'transform 0.2s ease' : 'none',
    // Drop-target cue while a drag would nest into this card. An inset ring in
    // the day's ink keeps the colour system OKLCH end to end (see CLAUDE.md).
    ...(nesting ? { boxShadow: `inset 0 0 0 2px ${shade.foreground}` } : null),
  }

  const chipBg = shade.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.20)'

  function handleClick(e: React.MouseEvent) {
    const from = downAt.current
    downAt.current = null
    // A tap while the bin is showing dismisses it instead of opening the editor.
    if (offset > 0) {
      closeSwipe()
      return
    }
    if (!from) return
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP_PX) return
    onEdit(task)
  }

  // Horizontal swipe tracking. Runs in the capture phase so it observes the
  // gesture without displacing dnd-kit's bubble-phase pointer listeners. Gated
  // to touch/pen: on a mouse, a horizontal drag belongs to dnd-kit's reorder.
  function onSwipeDown(e: React.PointerEvent) {
    downAt.current = { x: e.clientX, y: e.clientY }
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
      base: offset,
      dir: null,
      active: e.pointerType !== 'mouse',
    }
  }

  function onSwipeMove(e: React.PointerEvent) {
    const s = swipe.current
    if (!s || !s.active) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (s.dir === null) {
      if (Math.hypot(dx, dy) < TAP_SLOP_PX) return
      // Lock the axis on first real movement: a vertical intent is a scroll or
      // (after a long-press) a dnd-kit reorder — leave both alone.
      s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (s.dir === 'h') setAnimate(false)
    }
    if (s.dir !== 'h') return
    setOffset(Math.max(0, Math.min(REVEAL_PX, s.base - dx)))
  }

  function onSwipeEnd() {
    const s = swipe.current
    swipe.current = null
    if (!s || s.dir !== 'h') return
    setAnimate(true)
    setOffset((o) => (o > OPEN_THRESHOLD_PX ? REVEAL_PX : 0))
  }

  return (
    <div ref={setNodeRef} style={wrapStyle} className="task-wrap" {...attributes}>
      <div className="task-swipe">
        {/* Revealed behind the row as it slides left. Sits in the DOM before the
            row so the opaque row paints over it while the card is closed. */}
        <div className="task-reveal" aria-hidden={offset === 0}>
          <button
            type="button"
            className="task-reveal-btn"
            aria-label="Delete task"
            tabIndex={offset === 0 ? -1 : 0}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              closeSwipe()
              onDelete(task)
            }}
          >
            <BinIcon />
          </button>
        </div>
        <div
          style={rowStyle}
          className="task"
          {...listeners}
          // Capture phase: dnd-kit owns the bubbling onPointerDown via {...listeners}.
          onPointerDownCapture={onSwipeDown}
          onPointerMoveCapture={onSwipeMove}
          onPointerUpCapture={onSwipeEnd}
          onPointerCancelCapture={onSwipeEnd}
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

        {task.start_time && (
          <span className="chip" style={{ background: chipBg }}>
            {formatTime(task.start_time)}
          </span>
        )}

        {task.duration_min != null && (
          <span className="chip" style={{ background: chipBg }}>
            {formatDuration(task.duration_min)}
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
      </div>

      {expanded && (
        <SubtaskList
          subtasks={subtasks}
          shade={shade}
          onToggle={onToggleSubtask}
          onAdd={() => onAddSubtask(task)}
          onEdit={onEditSubtask}
          onDelete={onDeleteSubtask}
        />
      )}
    </div>
  )
}

function BinIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}
