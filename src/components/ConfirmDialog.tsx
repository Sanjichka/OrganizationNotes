import { useEffect, useRef } from 'react'

interface Props {
  title: string
  body?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Phone-first confirmation sheet: rises from the bottom, dims the board behind
 * it. Escape and a tap on the scrim both cancel — destructive actions should be
 * easy to back out of.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Kept in a ref so the mount effect does not re-run on every parent render.
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    confirmRef.current?.focus()
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

  return (
    <div className="scrim" onClick={onCancel}>
      <div
        className="sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        <h2 className="sheet-title">{title}</h2>
        {body && <p className="sheet-body">{body}</p>}
        <div className="sheet-actions">
          <button
            ref={confirmRef}
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
