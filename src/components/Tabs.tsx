export type Page = 'tasks' | 'stats'

const PAGES: { id: Page; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'stats', label: 'Stats' },
]

export function Tabs({
  page,
  onChange,
}: {
  page: Page
  onChange: (p: Page) => void
}) {
  return (
    <nav className="tabs" role="tablist" aria-label="Pages">
      {PAGES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={page === p.id}
          className={`tab${page === p.id ? ' tab-active' : ''}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </nav>
  )
}
