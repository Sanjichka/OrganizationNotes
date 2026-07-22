import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../lib/types'
import { BUCKET_LABEL } from '../lib/buckets'
import { sectionShade } from '../lib/shading'
import { DURATION_PRESETS, formatDuration } from '../lib/duration'

// What the sheet emits on submit. Duration and start time are both optional and
// independent (docs/decisions.md D6, D10); null means "not set / cleared".
export interface TaskDraft {
  title: string
  durationMin: number | null
  startTime: string | null
}

interface Props {
  bucket: Bucket
  /** 'task' (default) or 'subtask' — only changes the sheet's wording. A subtask
   *  is composed in the same sheet, tinted by its parent's bucket. */
  kind?: 'task' | 'subtask'
  /** Present when editing an existing task; absent when creating one. */
  initialTitle?: string
  initialDuration?: number | null
  /** HH:MM (already trimmed of any seconds) when editing. */
  initialStart?: string | null
  onSubmit: (draft: TaskDraft) => void
  onCancel: () => void
}

/**
 * Phone-first sheet for composing a task — new or existing. Wears the colour of
 * the bucket the task lives in, so the destination is legible before the task
 * exists — same sectionShade the day header uses, no second source of truth for
 * the palette. Besides the title it collects two optional fields: a duration
 * (preset chips + custom minutes) and a "when" clock time.
 */
export function TaskSheet({
  bucket,
  kind = 'task',
  initialTitle,
  initialDuration,
  initialStart,
  onSubmit,
  onCancel,
}: Props) {
  const editing = initialTitle !== undefined
  const noun = kind === 'subtask' ? 'subtask' : 'task'
  const [title, setTitle] = useState(initialTitle ?? '')
  const [durationMin, setDurationMin] = useState<number | null>(
    initialDuration ?? null,
  )
  // Custom minutes field is open when editing a task whose duration is a
  // non-preset value, so its number is visible and editable on open.
  const [customOpen, setCustomOpen] = useState(
    initialDuration != null &&
      !DURATION_PRESETS.includes(initialDuration as (typeof DURATION_PRESETS)[number]),
  )
  const [startTime, setStartTime] = useState(initialStart ?? '')
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
    // Editing opens on the existing name, so pre-select it: one keystroke
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
  const normalizedStart = startTime || null
  const unchanged =
    editing &&
    trimmed === initialTitle &&
    durationMin === (initialDuration ?? null) &&
    normalizedStart === (initialStart ?? null)

  // Tapping a preset toggles it; the custom field yields to it.
  function pickPreset(min: number) {
    setCustomOpen(false)
    setDurationMin((cur) => (cur === min ? null : min))
  }

  // The custom chip reveals a minutes field and clears any preset selection so
  // the two never claim to be selected at once.
  function toggleCustom() {
    setCustomOpen((open) => {
      if (open) {
        setDurationMin(null)
        return false
      }
      setDurationMin(null)
      return true
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed || unchanged) return
    onSubmit({ title: trimmed, durationMin, startTime: normalizedStart })
  }

  // Filled chips carry the bucket accent; unselected ones are a quiet outline in
  // the same colour, matching the sheet's tint rather than introducing greys.
  function chipStyle(active: boolean): React.CSSProperties {
    return active
      ? { background: shade.accent, color: shade.background, borderColor: shade.accent }
      : { color: shade.label, borderColor: shade.accent }
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
            ? `Edit ${noun}`
            : kind === 'subtask'
              ? 'New subtask'
              : `New task ${preposition} ${BUCKET_LABEL[bucket]}`
        }
        style={{ background: shade.background }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet-grip" style={{ background: shade.accent }} />
        <h2 className="sheet-title" style={{ color: shade.label }}>
          {editing ? (
            `Edit ${noun}`
          ) : kind === 'subtask' ? (
            'New subtask'
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

        {/* Duration — optional. Preset chips plus a custom minutes field. */}
        <div className="sheet-field">
          <span className="sheet-field-label" style={{ color: shade.label }}>
            Duration
          </span>
          <div className="chip-row">
            {DURATION_PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                className="pick-chip"
                style={chipStyle(!customOpen && durationMin === min)}
                aria-pressed={!customOpen && durationMin === min}
                onClick={() => pickPreset(min)}
              >
                {formatDuration(min)}
              </button>
            ))}
            <button
              type="button"
              className="pick-chip"
              style={chipStyle(customOpen)}
              aria-pressed={customOpen}
              onClick={toggleCustom}
            >
              Custom
            </button>
            {customOpen && (
              <span className="custom-min" style={{ color: shade.label }}>
                <input
                  className="input custom-min-input"
                  style={{ borderColor: shade.accent, color: shade.label }}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1440}
                  value={durationMin ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setDurationMin(Number.isFinite(n) && n > 0 ? n : null)
                  }}
                  placeholder="min"
                  aria-label="Custom duration in minutes"
                />
                min
              </span>
            )}
          </div>
        </div>

        {/* When — optional clock time of day. */}
        <div className="sheet-field">
          <span className="sheet-field-label" style={{ color: shade.label }}>
            When
          </span>
          <input
            className="input time-input"
            style={{ borderColor: shade.accent, color: shade.label }}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            aria-label="Start time"
          />
        </div>

        <div className="sheet-actions">
          <button
            type="submit"
            className="btn"
            style={{ background: shade.accent }}
            disabled={!trimmed || unchanged}
          >
            {editing ? 'Save' : `Add ${noun}`}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
