export type Page = 'week' | 'next' | 'review' | 'overall'

const PAGES: { id: Page; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'next', label: 'Next week' },
  { id: 'review', label: 'Weekly review' },
  { id: 'overall', label: 'Overall review' },
]

/**
 * The view switch. A segmented pill toggle that sits inside the header — the
 * whole of the app's top-level navigation, replacing the old fixed bottom bar
 * (see design-system.md / decisions.md D8).
 *
 * Four segments is the ceiling for this control on a phone: the labels wrap to
 * two lines rather than truncate, because "Weekly" and "Overall" are the only
 * words that distinguish the two reviews and an ellipsis would eat them.
 */
export function Tabs({
  page,
  onChange,
}: {
  page: Page
  onChange: (p: Page) => void
}) {
  return (
    <div className="seg" role="tablist" aria-label="Views">
      {PAGES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={page === p.id}
          className={`seg-btn${page === p.id ? ' seg-btn-active' : ''}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
