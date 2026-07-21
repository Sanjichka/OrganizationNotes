import { useRef, useState } from 'react'
import type { Subtask } from '../lib/types'
import type { Shade } from '../lib/shading'

interface Props {
  subtasks: Subtask[] // already sorted by position
  /** Parent card shade — the checkbox borrows the day's ink so rows read as
   *  belonging to their task rather than floating free. */
  shade: Shade
  onToggle: (subtask: Subtask) => void
  onAdd: (title: string) => void
  onRename: (subtask: Subtask, title: string) => void
  onDelete: (subtask: Subtask) => void
}

/**
 * The checklist that unfolds beneath a task card. Rendered inside the sortable
 * wrapper but OUTSIDE the draggable card row, so dragging the parent is
 * unaffected and taps here never start a drag.
 */
export function SubtaskList({
  subtasks,
  shade,
  onToggle,
  onAdd,
  onRename,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function commitRename(subtask: Subtask) {
    const title = draft.trim()
    setEditingId(null)
    if (title && title !== subtask.title) onRename(subtask, title)
  }

  return (
    <div className="subtasks">
      {subtasks.map((s) => (
        <div key={s.id} className="subtask">
          <button
            type="button"
            className="subtask-check"
            aria-label={s.done ? 'Mark subtask not done' : 'Mark subtask done'}
            onClick={() => onToggle(s)}
            style={{
              borderColor: shade.foreground,
              background: s.done ? shade.foreground : 'transparent',
              color: shade.background,
            }}
          >
            {s.done ? '✓' : ''}
          </button>

          {editingId === s.id ? (
            <input
              className="subtask-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitRename(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(s)
                if (e.key === 'Escape') setEditingId(null)
              }}
              maxLength={200}
            />
          ) : (
            <span
              className="subtask-title"
              style={{
                textDecoration: s.done ? 'line-through' : 'none',
                opacity: s.done ? 0.55 : 0.9,
              }}
              onClick={() => {
                setDraft(s.title)
                setEditingId(s.id)
              }}
            >
              {s.title}
            </span>
          )}

          <button
            type="button"
            className="subtask-delete"
            aria-label="Delete subtask"
            onClick={() => onDelete(s)}
          >
            ×
          </button>
        </div>
      ))}

      <AddSubtaskRow onAdd={onAdd} accent={shade.foreground} />
    </div>
  )
}

/** A persistent input row so several subtasks can be typed in a row. */
function AddSubtaskRow({
  onAdd,
  accent,
}: {
  onAdd: (title: string) => void
  accent: string
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function submit() {
    const title = value.trim()
    if (!title) return
    onAdd(title)
    setValue('')
    // Keep focus so the next item can be typed straight away.
    inputRef.current?.focus()
  }

  return (
    <div className="subtask subtask-add">
      <span className="subtask-plus" style={{ color: accent }}>
        +
      </span>
      <input
        ref={inputRef}
        className="subtask-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        onBlur={submit}
        placeholder="Add subtask"
        enterKeyHint="done"
        maxLength={200}
      />
    </div>
  )
}
