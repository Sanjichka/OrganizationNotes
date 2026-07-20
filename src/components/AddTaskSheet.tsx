import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../lib/types'
import { BUCKET_LABEL } from '../lib/buckets'
import { sectionShade } from '../lib/shading'

interface Props {
  bucket: Bucket
  onSubmit: (title: string) => void
  onCancel: () => void
}

/**
 * Phone-first sheet for creating a task. Wears the colour of the bucket it will
 * land in, so the destination is legible before the task exists — same
 * sectionShade the day header uses, no second source of truth for the palette.
 */
export function AddTaskSheet({ bucket, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Kept in a ref so the mount effect does not re-run on every parent render.
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  const shade = sectionShade(bucket)
  const preposition = bucket === 'backlog' ? 'in' : 'on'

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    // Stop the board scrolling behind the sheet.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  const trimmed = title.trim()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="scrim" onClick={onCancel}>
      <form
        className="sheet sheet-tinted"
        role="dialog"
        aria-modal="true"
        aria-label={`New Task ${preposition} ${BUCKET_LABEL[bucket]}`}
        style={{ background: shade.background }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet-grip" style={{ background: shade.accent }} />
        <h2 className="sheet-title" style={{ color: shade.label }}>
          New Task {preposition}{' '}
          <span style={{ color: shade.accent }}>{BUCKET_LABEL[bucket]}</span>
        </h2>
        <input
          ref={inputRef}
          className="input sheet-input"
          style={{ borderColor: shade.accent, color: shade.label }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          enterKeyHint="done"
          maxLength={200}
        />
        <div className="sheet-actions">
          <button
            type="submit"
            className="btn"
            style={{ background: shade.accent }}
            disabled={!trimmed}
          >
            Add task
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
