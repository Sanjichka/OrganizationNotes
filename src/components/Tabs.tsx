export type Page = 'tasks' | 'stats'

const PAGES: { id: Page; label: string }[] = [
  { id: 'tasks', label: 'Week' },
  { id: 'stats', label: 'Review' },
]

/**
 * The Week / Review view switch. A segmented pill toggle that sits inside the
 * header — the whole of the app's top-level navigation, replacing the old
 * fixed bottom bar (see design-system.md / decisions.md).
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
