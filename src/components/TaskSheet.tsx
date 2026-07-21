import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../lib/types'
import { BUCKET_LABEL } from '../lib/buckets'
import { sectionShade } from '../lib/shading'

interface Props {
  bucket: Bucket
  /** Present when renaming an existing task; absent when creating one. */
  initialTitle?: string
  onSubmit: (title: string) => void
  onCancel: () => void
}

/**
 * Phone-first sheet for naming a task — new or existing. Wears the colour of the
 * bucket the task lives in, so the destination is legible before the task
 * exists — same sectionShade the day header uses, no second source of truth for
 * the palette.
 */
export function TaskSheet({ bucket, initialTitle, onSubmit, onCancel }: Props) {
  const editing = initialTitle !== undefined
  const [title, setTitle] = useState(initialTitle ?? '')
  // Height the on-screen keyboard steals from the bottom. iOS doesn't shrink the
  // layout viewport when the keyboard opens, so a bottom-anchored sheet slides
  // in behind it — we read the visual viewport and lift the sheet by that much.
  const [keyboardInset, setKeyboardInset] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Kept in a ref so the mount effect does not re-run on every parent render.
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  const shade = sectionShade(bucket)
  const preposition = bucket === 'backlog' ? 'in' : 'on'

  useEffect(() => {
    const input = inputRef.current
    input?.focus()
    // Renaming opens on the existing name, so pre-select it: one keystroke
    // replaces the lot, a tap still puts the caret where it landed.
    input?.select()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    // Stop the board scrolling behind the sheet.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Lift the sheet above the keyboard. The keyboard's height is the slice of
    // the layout viewport the visual viewport no longer covers at the bottom.
    const vv = window.visualViewport
    function onViewport() {
      if (!vv) return
      const inset = window.innerHeight - vv.height - vv.offsetTop
      setKeyboardInset(Math.max(0, Math.round(inset)))
    }
    vv?.addEventListener('resize', onViewport)
    vv?.addEventListener('scroll', onViewport)
    onViewport()

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      vv?.removeEventListener('resize', onViewport)
      vv?.removeEventListener('scroll', onViewport)
    }
  }, [])

  const trimmed = title.trim()
  const unchanged = editing && trimmed === initialTitle

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed || unchanged) return
    onSubmit(trimmed)
  }

  return (
    <div
      className="scrim"
      style={{ paddingBottom: keyboardInset }}
      onClick={onCancel}
    >
      <form
        className="sheet sheet-tinted"
        role="dialog"
        aria-modal="true"
        aria-label={
          editing
            ? 'Rename task'
            : `New Task ${preposition} ${BUCKET_LABEL[bucket]}`
        }
        style={{ background: shade.background }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet-grip" style={{ background: shade.accent }} />
        <h2 className="sheet-title" style={{ color: shade.label }}>
          {editing ? (
            'Rename task'
          ) : (
            <>
              New Task {preposition}{' '}
              <span style={{ color: shade.accent }}>{BUCKET_LABEL[bucket]}</span>
            </>
          )}
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
            disabled={!trimmed || unchanged}
          >
            {editing ? 'Save' : 'Add task'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
